# GitHub Organization Member Email Report Action

> A GitHub Action to generate a report retrieving member email addresses from a GitHub cloud organization where possible.

This Action tries to retrieve the three types of user email from the personal user account and linked SSO identity for GitHub cloud organization members.

The three GitHub user email types which could be retrieved are:

- The [account email](https://docs.github.com/account-and-profile/setting-up-and-managing-your-github-user-account/managing-email-preferences/adding-an-email-address-to-your-github-account) (if not set to hidden by the user)
- The [verified email](https://github.blog/changelog/2020-05-19-api-support-for-viewing-organization-members-verified-email-addresses/) (if a verified domain is set which matches the user account email domain)
- The organization [SSO linked identity (nameID) email](https://docs.github.com/graphql/reference/objects#externalidentitysamlattributes) (if SAML SSO is enabled)

:bulb: When multiple [verified domain names](https://docs.github.com/organizations/managing-organization-settings/verifying-or-approving-a-domain-for-your-organization) are set, more than a single match per member can occur, the verified email field in the report would then return multiple results.

## Usage

By default the example [workflow](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions) below runs on a monthly [schedule](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#scheduled-events) but the Action can also be triggered manually using a [workflow_dispatch](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#manual-events).

```yml
name: Member Email Report

on:
  schedule:
    # Runs on the first day of every month at 00:00 UTC
    #
    #        ┌────────────── minute
    #        │ ┌──────────── hour
    #        │ │ ┌────────── day (month)
    #        │ │ │ ┌──────── month
    #        │ │ │ │ ┌────── day (week)
    - cron: '0 0 1 * *'
  workflow_dispatch:

jobs:
  member-email-report:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Get member emails
        uses: nicklegan/github-org-member-email-action@v2.0.0
        with:
          token: ${{ secrets.ORG_TOKEN }}
        # org: ''
        # sort: 'userName'
        # sort-order: 'asc'
        # single-report: 'false'
        # json: 'false'
        # appid: ${{ secrets.APPID }}
        # privatekey: ${{ secrets.PRIVATEKEY }}
        # installationid: ${{ secrets.INSTALLATIONID }}
```

## GitHub secrets

| Name                 | Value                                                              | Required |
| :------------------- | :----------------------------------------------------------------- | :------- |
| `ORG_TOKEN`          | An `user:email`, `repo`, `admin:org`scoped [Personal Access Token] | `true`   |
| `ACTIONS_STEP_DEBUG` | `true` [Enables diagnostic logging]                                | `false`  |

[personal access token]: https://github.com/settings/tokens/new?scopes=admin:org,repo,user:email&description=Member+Email+Action 'Personal Access Token'
[enables diagnostic logging]: https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-runner-diagnostic-logging 'Enabling runner diagnostic logging'

:bulb: Disable [token expiration](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/) to avoid failed workflow runs when running on a schedule.

## Action inputs

| Name              | Description                                                                                                                  | Default                     | Location       | Required |
| :---------------- | :--------------------------------------------------------------------------------------------------------------------------- | :-------------------------- | :------------- | :------- |
| `org`             | Organization different than workflow context                                                                                 |                             | [workflow.yml] | `false`  |
| `sort`            | CSV column used to sort report: `userName`, `fullName`, `publicEmail`, `verifiedEmail`, `ssoEmail`, `updatedAt`, `createdAt` | `userName`                  | [workflow.yml] | `false`  |
| `sort-order`      | CSV column sort order: `asc` or `desc`                                                                                       | `asc`                       | [workflow.yml] | `false`  |
| `single-report`   | Setting to generate an additional timestamped CSV report per workflow run                                                    | `false`                     | [workflow.yml] | `false`  |
| `json`            | Setting to generate an additional report in JSON format                                                                      | `false`                     | [workflow.yml] | `false`  |
| `committer-name`  | The name of the committer that will appear in the Git history                                                                | `github-actions`            | [action.yml]   | `false`  |
| `committer-email` | The committer email that will appear in the Git history                                                                      | `github-actions@github.com` | [action.yml]   | `false`  |

[workflow.yml]: #Usage 'Usage'
[action.yml]: action.yml 'action.yml'

## CSV layout

| Column         | Description                                  |
| :------------- | :------------------------------------------- |
| Username       | GitHub username                              |
| Full name      | GitHub profile name                          |
| Public email   | GitHub account email                         |
| Verified email | GitHub verified domain email                 |
| SSO email      | GitHub linked NameID email                   |
| Updated        | The date the user settings were last updated |
| Created        | The date the user account was created        |

A CSV report file will be saved in the repository **reports** folder using the following naming format: **organization-date.csv**.

If the `single-report` option is enabled in **action.yml** an additional unique report per workflow run will be generated in the **reports/single** folder.

## GitHub App authentication

In some scenarios it might be preferred to authenthicate as a [GitHub App](https://docs.github.com/developers/apps/getting-started-with-apps/about-apps) rather than using a [personal access token](https://docs.github.com/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token).

The following features could be a benefit authenticating as a GitHub App installation:

- The GitHub App is directly installed on the organization, no seperate user account is required.
- A GitHub App has more granular permission options than a personal access token.
- To avoid hitting the 5000 requests per hour GitHub API rate limit, [authenticating as a GitHub App installation](https://docs.github.com/developers/apps/building-github-apps/authenticating-with-github-apps#authenticating-as-an-installation) would increase the [API request limit](https://docs.github.com/developers/apps/building-github-apps/rate-limits-for-github-apps#github-enterprise-cloud-server-to-server-rate-limits).

:bulb: When using GitHub App authentication, the organization members can only be retrieved from the organization the GitHub App is installed in.

### Configuration

[Register](https://docs.github.com/developers/apps/building-github-apps/creating-a-github-app) a new organization/personal owned GitHub App with the below permissions:

| GitHub App Permission                     | Access           |
| :---------------------------------------- | :--------------- |
| `Organization Permissions:Administration` | `read`           |
| `Organization Permissions:Members`        | `read`           |
| `Repository Permissions:Contents`         | `read and write` |
| `User Permissions:Email addresses`        | `read`           |

After registration install the GitHub App to your organization. Store the below App values as secrets.

### GitHub App secrets

| Name             | Value                             | Required |
| :--------------- | :-------------------------------- | :------- |
| `APPID`          | GitHub App ID number              | `true`   |
| `PRIVATEKEY`     | Content of private key .pem file  | `true`   |
| `INSTALLATIONID` | GitHub App installation ID number | `true`   |
