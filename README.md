# GitHub Organization Member Email Action

> A GitHub Action to generate a report retrieving all organization member email addresses where possible.

This Action tries to retrieve the three different types of user emails from the personal user account of GitHub Enterprise Cloud organization members.

The three GitHub user email types which could be retrieved are:

- The [account email](https://docs.github.com/account-and-profile/setting-up-and-managing-your-github-user-account/managing-email-preferences/adding-an-email-address-to-your-github-account) (if not set to hidden by the user)
- The [verified account email](https://github.blog/changelog/2020-05-19-api-support-for-viewing-organization-members-verified-email-addresses/) (if a verified domain is set and matches the account email domain)
- The organization [SSO linked identity (nameID) email](https://docs.github.com/graphql/reference/objects#externalidentitysamlattributes) (if SSO is enabled)

:bulb: If a personal account email is set to hidden, as long as the email domain matches a verified domain name, the email address can be retrieved. 

:bulb: If multiple [verified domain names](https://docs.github.com/organizations/managing-organization-settings/verifying-or-approving-a-domain-for-your-organization) are set, more than a single match per member can occur, the verified email field in the report would then return multiple results.

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
        uses: actions/checkout@v2

      - name: Get member emails
        uses: nicklegan/github-org-member-email-action@v1.0.0
        with:
          token: ${{ secrets.ORG_TOKEN }}
```

## GitHub secrets

| Name                 | Value                                                             | Required |
| :------------------- | :---------------------------------------------------------------- | :------- |
| `ORG_TOKEN`          | A `user:email`, `repo`, `admin:org`scoped [Personal Access Token] | `true`   |
| `ACTIONS_STEP_DEBUG` | `true` [Enables diagnostic logging]                               | `false`  |

[personal access token]: https://github.com/settings/tokens/new?scopes=admin:org,repo,user:email&description=Member+Email+Action 'Personal Access Token'
[enables diagnostic logging]: https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-runner-diagnostic-logging 'Enabling runner diagnostic logging'

:bulb: Disable [token expiration](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/) to avoid failed workflow runs when running on a schedule.

## Action inputs

| Name              | Description                                                   | Default                     | Options | Required |
| :---------------- | :------------------------------------------------------------ | :-------------------------- | :------ | :------- |
| `org`             | Organization different than workflow context                  |                             |         | `false`  |
| `single-report`   | Setting to generate an additional report per workflow run     |                             | `TRUE`  | `false`  |
| `committer-name`  | The name of the committer that will appear in the Git history | `github-actions`            |         | `false`  |
| `committer-email` | The committer email that will appear in the Git history       | `github-actions@github.com` |         | `false`  |

## CSV layout

| Column         | Description                                  |
| :------------- | :------------------------------------------- |
| Username       | GitHub username                              |
| Full name      | GitHub profile name                          |
| Public email   | GitHub account email                         |
| Verified email | GitHub verified domain email                 |
| SSO email      | GitHub NameID email                          |
| Updated        | The date the user settings were last updated |
| Created        | The date the user account was created        |

A CSV report file will be saved in the repository **reports** folder using the following naming format: **organization-date.csv**.

If the `single-report` option is enabled in **action.yml** an additional unique report per workflow run will be generated in the **reports/single** folder.

## GitHub App authentication

In some scenarios it might be a better idea to authenthicate as a [GitHub App](https://docs.github.com/developers/apps/getting-started-with-apps/about-apps) rather than using a [personal access token](https://docs.github.com/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token).

The following features could be a benefit authenticating as a GitHub App installation:

- The GitHub App is directly installed on the organization, no seperate user account is required.
- A GitHub App has more granular permissions than a personal access token.
- To avoid hitting the 5000 requests per hour GitHub API rate limit, [authenticating as a GitHub App installation](https://docs.github.com/developers/apps/building-github-apps/authenticating-with-github-apps#authenticating-as-an-installation) would increase the [API request limit](https://docs.github.com/developers/apps/building-github-apps/rate-limits-for-github-apps#github-enterprise-cloud-server-to-server-rate-limits).

The GitHub App authentication strategy can be integrated with the Octokit library by installing and configuring the [@octokit/auth-app](https://github.com/octokit/auth-app.js/#usage-with-octokit) npm module before [rebuilding](https://docs.github.com/actions/creating-actions/creating-a-javascript-action) the Action in a separate repository.
