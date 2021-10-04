const core = require('@actions/core')
const stringify = require('csv-stringify/lib/sync')
const {Octokit} = require('@octokit/rest')
const token = core.getInput('token', {required: true})
const octokit = new Octokit({auth: token})

const eventPayload = require(process.env.GITHUB_EVENT_PATH)
const org = core.getInput('org', {required: false}) || eventPayload.organization.login
const owner = eventPayload.repository.owner.login
const repo = eventPayload.repository.name
const committerName = core.getInput('committer-name', {required: false}) || 'github-actions'
const committerEmail = core.getInput('committer-email', {required: false}) || 'github-actions@github.com'
const singleReport = core.getInput('single-report', {required: false}) || ''

// Retrieve all members of a SSO enabled organization
async function ssoEmail(emailArray) {
  try {
    let paginationMember = null

    const query = `query ($org: String! $cursorID: String) {
      organization(login: $org ) {
          samlIdentityProvider {
            externalIdentities(first:100 after: $cursorID) {
              totalCount
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

    let hasNextPageMember = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        org: org,
        cursorID: paginationMember
      })

      const emails = dataJSON.organization.samlIdentityProvider.externalIdentities.edges

      hasNextPageMember = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.hasNextPage

      for (const email of emails) {
        if (hasNextPageMember) {
          paginationMember = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.endCursor
        } else {
          paginationMember = null
        }

        if (!email.node.user) continue
        const userName = email.node.user.login
        const fullName = email.node.user.name
        const ssoEmail = email.node.samlIdentity.nameId
        const publicEmail = email.node.user.email
        const verifiedEmail = email.node.user.organizationVerifiedDomainEmails ? email.node.user.organizationVerifiedDomainEmails.join(', ') : ''
        const updatedAt = email.node.user.updatedAt.slice(0, 10)
        const createdAt = email.node.user.createdAt.slice(0, 10)

        emailArray.push({userName, fullName, ssoEmail, publicEmail, verifiedEmail, updatedAt, createdAt})

        console.log(`${userName}`)
      }
    } while (hasNextPageMember)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Retrieve all members of a SSO-disabled organization
async function dotcomEmail(emailArray) {
  try {
    let paginationMember = null

    const query = `query ($org: String! $cursorID: String) {
      organization(login: $org ) {
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

    let hasNextPageMember = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        org: org,
        cursorID: paginationMember
      })

      const emails = dataJSON.organization.membersWithRole.edges

      hasNextPageMember = dataJSON.organization.membersWithRole.pageInfo.hasNextPage

      for (const email of emails) {
        if (hasNextPageMember) {
          paginationMember = dataJSON.organization.membersWithRole.pageInfo.endCursor
        } else {
          paginationMember = null
        }

        if (!email.node.login) continue
        const userName = email.node.login
        const fullName = email.node.name
        const publicEmail = email.node.email
        const verifiedEmail = email.node.organizationVerifiedDomainEmails ? email.node.organizationVerifiedDomainEmails.join(', ') : ''
        const updatedAt = email.node.updatedAt.slice(0, 10)
        const createdAt = email.node.createdAt.slice(0, 10)

        console.log(`${userName}`)
        emailArray.push({userName, fullName, publicEmail, verifiedEmail, updatedAt, createdAt})
      }
    } while (hasNextPageMember)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Retrieve organization SSO status and query the organization
;(async () => {
  try {
    let emailArray = []

    const query = `query ($org: String!) {
        organization(login: $org ) {
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

    emailArray.unshift(columns)

    // Convert array to csv
    const csv = stringify(emailArray, {})

    // Prepare path/filename, set repo/org context and commit name/email/message parameters
    const reportPath = {path: `reports/${org}-member-email-report.csv`}

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
      const {data} = await octokit.repos.getContent({
        owner,
        repo,
        ...reportPath
      })

      if (data && data.sha) {
        reportPath.sha = data.sha
      }
    } catch (error) {
    // do nothing
    }

    // push csvs to repo
    await octokit.repos.createOrUpdateFileContents({
      ...opts,
      ...reportPath
    })

    if (singleReport === 'TRUE') {
      const singlePath = {path: `reports/single/${org}-${new Date().toISOString().substring(0, 19) + 'Z'}.csv`}

      await octokit.repos.createOrUpdateFileContents({
        ...opts,
        ...singlePath
      })
    }
  } catch (error) {
    core.setFailed(error.message)
  }
})()
