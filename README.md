<div align="center">
    <img alt="Casual Simulation Logo" src="./.github/images/casual-sim-logo.gif" width="180"/>
    <br/>
    <br/>
    <a href="https://github.com/casual-simulation/casual-apiary-aws/issues">
        <img alt="GitHub Issues" src="https://img.shields.io/github/issues/casual-simulation/casual-apiary-aws.svg">
    </a>
    <a href="https://github.com/casual-simulation/casual-apiary-aws/blob/develop/LICENSE.txt">
        <img alt="MIT License" src="https://img.shields.io/github/license/casual-simulation/casual-apiary-aws.svg">
    </a>
    <a href="https://actions-badge.atrox.dev/casual-simulation/casual-apiary-aws/goto?ref=main">
        <img alt="Build Status" src="https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Fcasual-simulation%2Fcasual-apiary-aws%2Fbadge%3Fref%3Dmain&style=flat" />
    </a>
    <h1>Casual Apiary AWS</h1>
    <p>
        A Serverless AWS project that can host many CasualOS instances at once.
    </p>
</div>

# Notice

This repository has been archived and the functionality has been moved to the main CasualOS repo: https://github.com/casual-simulation/casualos

## Setup

1. Install the [Serverless framework](https://www.serverless.com/framework/docs/getting-started/)

```bash
$ npm install -g serverless@2.11.1
```

2. Install dependencies with Yarn.

```bash
$ yarn
```

3. Install [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)

```bash
$ yarn dynamodb:install
```

4. Start running.

```bash
$ yarn start
```

## Deployment

### GitHub Actions

To deploy using GitHub Actions, simply create a tag on the commit you want to deploy.

-   To deploy to the `boormanlabs` stage, create and push a tag that starts with `boormanlabs/` (like `boormanlabs/v2.0`).
-   To deploy to the `casualos-redis` stage, create and push a tag that starts with `casualos/` (like `casualos/v1.0`).

### Manual

1. Make sure you have the [AWS CLI](https://aws.amazon.com/cli/) and [the `casualsimulation` profile is configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html#cli-configure-quickstart-profiles):

```bash
$ aws configure --profile casualsimulation
```

2. Deploy to AWS

```bash
$ serverless deploy --stage mystage
```
