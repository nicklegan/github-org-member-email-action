const core = require('@actions/core')
const github = require('@actions/github')
const { GitHub } = require('@actions/github/lib/utils')
const { createAppAuth } = require('@octokit/auth-app')
const { stringify } = require('csv-stringify/sync')
const { orderBy } = require('natural-orderby')
const token = core.getInput('token', { required: false })
const eventPayload = require(process.env.GITHUB_EVENT_PATH)
const owner = eventPayload.repository.owner.login
const repo = eventPayload.repository.name

const appId = core.getInput('appid', { required: false })
const privateKey = core.getInput('privatekey', { required: false })
const installationId = core.getInput('installationid', { required: false })

const org = core.getInput('org', { required: false }) || eventPayload.organization.login
const committerName = core.getInput('committer-name', { required: false }) || 'github-actions'
const committerEmail = core.getInput('committer-email', { required: false }) || 'github-actions@github.com'
const singleReport = core.getInput('single-report', { required: false }) || 'false'
const sortColumn = core.getInput('sort', { required: false }) || 'userName'
const sortOrder = core.getInput('sort-order', { required: false }) || 'asc'
const jsonExport = core.getInput('json', { required: false }) || 'false'

let octokit = null

// GitHub App authentication
if (appId && privateKey && installationId) {
  octokit = new GitHub({
    authStrategy: createAppAuth,
    auth: {
      appId: appId,
      privateKey: privateKey,
      installationId: installationId
    }
  })
} else {
  octokit = github.getOctokit(token)
}

// Orchestrator
;(async () => {
  try {
    const emailArray = []
    await getSamlId(emailArray)
    await csvReport(emailArray)
    if (jsonExport === 'true') {
      await jsonReport(emailArray)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
})()

// Retrieve organization SSO status
async function getSamlId(emailArray) {
  try {
    const query = /* GraphQL */ `
      query ($org: String!) {
        organization(login: $org) {
          samlIdentityProvider {
            id
          }
        }
      }
    `

    dataJSON = await octokit.graphql({
      query,
      org: org
    })

    if (dataJSON.organization.samlIdentityProvider) {
      await ssoEmail(emailArray)
    } else {
      await dotcomEmail(emailArray)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Retrieve all members of a SSO enabled organization
async function ssoEmail(emailArray) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($org: String!, $cursorID: String) {
        organization(login: $org) {
          samlIdentityProvider {
            externalIdentities(first: 100, after: $cursorID) {
              edges {
                node {
                  samlIdentity {
                    nameId
                  }
                  user {
                    login
                    name
                    email
                    createdAt
                    updatedAt
                    organizationVerifiedDomainEmails(login: $org)
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `

    let hasNextPage = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        org: org,
        cursorID: endCursor
      })

      const emails = dataJSON.organization.samlIdentityProvider.externalIdentities.edges

      hasNextPage = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.hasNextPage

      for (const email of emails) {
        if (hasNextPage) {
          endCursor = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.endCursor
        } else {
          endCursor = null
        }

        if (!email.node.user) continue
        const userName = email.node.user.login
        const fullName = email.node.user.name
        const ssoEmail = email.node.samlIdentity.nameId
        const publicEmail = email.node.user.email
        const verifiedEmail = email.node.user.organizationVerifiedDomainEmails ? email.node.user.organizationVerifiedDomainEmails.join(', ') : ''
        const updatedAt = email.node.user.updatedAt.slice(0, 10)
        const createdAt = email.node.user.createdAt.slice(0, 10)

        emailArray.push({ userName, fullName, ssoEmail, publicEmail, verifiedEmail, updatedAt, createdAt })

        console.log(`${userName}`)
      }
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Retrieve all members of a SSO-disabled organization
async function dotcomEmail(emailArray) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($org: String!, $cursorID: String) {
        organization(login: $org) {
          membersWithRole(first: 100, after: $cursorID) {
            edges {
              node {
                login
                name
                email
                organizationVerifiedDomainEmails(login: $org)
                updatedAt
                createdAt
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `

    let hasNextPage = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        org: org,
        cursorID: endCursor
      })

      const emails = dataJSON.organization.membersWithRole.edges

      hasNextPage = dataJSON.organization.membersWithRole.pageInfo.hasNextPage

      for (const email of emails) {
        if (hasNextPage) {
          endCursor = dataJSON.organization.membersWithRole.pageInfo.endCursor
        } else {
          endCursor = null
        }

        if (!email.node.login) continue
        const userName = email.node.login
        const fullName = email.node.name
        const publicEmail = email.node.email
        const verifiedEmail = email.node.organizationVerifiedDomainEmails ? email.node.organizationVerifiedDomainEmails.join(', ') : ''
        const updatedAt = email.node.updatedAt.slice(0, 10)
        const createdAt = email.node.createdAt.slice(0, 10)

        console.log(`${userName}`)
        emailArray.push({ userName, fullName, publicEmail, verifiedEmail, updatedAt, createdAt })
      }
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function csvReport(emailArray) {
  try {
    // Add columns to array result
    const columns = {
      userName: 'Username',
      fullName: 'Full name',
      publicEmail: 'Public email',
      verifiedEmail: 'Verified email',
      ssoEmail: 'SSO email',
      updatedAt: 'Updated',
      createdAt: 'Created'
    }

    // Sort array by column
    const sortArray = orderBy(emailArray, [sortColumn], [sortOrder])

    // Convert array to csv
    const csv = stringify(sortArray, {
      header: true,
      columns: columns
    })

    // Prepare path/filename, set repo/org context and commit name/email/message parameters
    const reportPath = { path: `reports/${org}-member-email-report.csv` }

    const opts = {
      owner,
      repo,
      message: `${new Date().toISOString().slice(0, 10)} Member email report`,
      content: Buffer.from(csv).toString('base64'),
      committer: {
        name: committerName,
        email: committerEmail
      }
    }

    // try to get the sha, if the file already exists
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        ...reportPath
      })

      if (data && data.sha) {
        reportPath.sha = data.sha
      }
    } catch (error) {}

    // push csv report to repo
    await octokit.rest.repos.createOrUpdateFileContents({
      ...opts,
      ...reportPath
    })

    // push optional single csv report to repo
    if (singleReport === 'true') {
      const singlePath = { path: `reports/single/${org}-${new Date().toISOString().substring(0, 19) + 'Z'}.csv` }

      await octokit.rest.repos.createOrUpdateFileContents({
        ...opts,
        ...singlePath
      })
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Generate an optional JSON report
async function jsonReport(emailArray) {
  try {
    // Prepare path/filename, set repo/org context and commit name/email/message parameters
    const reportPath = { path: `reports/${org}-member-email-report.json` }
    const opts = {
      owner,
      repo,
      message: `${new Date().toISOString().slice(0, 10)} Member email report`,
      content: Buffer.from(JSON.stringify(emailArray, null, 2)).toString('base64'),
      committer: {
        name: committerName,
        email: committerEmail
      }
    }

    // try to get the sha, if the file already exists
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        ...reportPath
      })

      if (data && data.sha) {
        reportPath.sha = data.sha
      }
    } catch (err) {}

    // push json report to repo
    await octokit.rest.repos.createOrUpdateFileContents({
      ...opts,
      ...reportPath
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}
