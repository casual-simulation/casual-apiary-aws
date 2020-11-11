import type { Serverless, ApiGateway } from 'serverless/aws';

const serverlessConfiguration: Serverless = {
    service: 'casual-apiary-aws',
    org: 'kallyngowdy',
    app: 'casual-apiary',
    frameworkVersion: '2',
    custom: {
        webpack: {
            webpackConfig: './webpack.config.js',
            includeModules: true,
        },
    },
    // Add the serverless-webpack plugin
    plugins: ['serverless-webpack'],
    provider: {
        name: 'aws',
        runtime: 'nodejs12.x',
        profile: 'casualsimulation',
        apiGateway: {
            shouldStartNameWithService: true,
            minimumCompressionSize: 1024,
        } as ApiGateway,
        environment: {
            AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        },
    },
    functions: {
        hello: {
            handler: 'handler.hello',
            events: [
                {
                    http: {
                        method: 'get',
                        path: 'hello',
                    },
                },
            ],
        },
    },
    resources: {
        Resources: {
            AtomsTable: {
                Type: 'AWS::DynamoDB::Table',
                Properties: {
                    TableName: 'AtomsTable',
                    AttributeDefinitions: [
                        {
                            AttributeName: 'namespace',
                            AttributeType: 'S',
                        },
                        {
                            AttributeName: 'atomId',
                            AttributeType: 'S',
                        },
                    ],
                    KeySchema: [
                        {
                            AttributeName: 'namespace',
                            KeyType: 'HASH',
                        },
                        {
                            AttributeName: 'atomId',
                            KeyType: 'RANGE',
                        },
                    ],
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 1,
                        WriteCapacityUnits: 1,
                    },
                },
            },
        },
    },
};

module.exports = serverlessConfiguration;
