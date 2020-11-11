# Casual Apiary AWS

A Serverless AWS project that can host many CasualOS instances at once.

## Setup

1. Install the [Serverless framework](https://www.serverless.com/framework/docs/getting-started/)

```bash
$ npm install -g serverless
```

2. Install dependencies with Yarn.

```bash
$ yarn
```

3. Make sure you have the [AWS CLI](https://aws.amazon.com/cli/) and [the `casualsimulation` profile is configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html#cli-configure-quickstart-profiles):

```bash
$ aws configure --profile casualsimulation
```

4. Deploy to AWS

```bash
$ serverless deploy
```
