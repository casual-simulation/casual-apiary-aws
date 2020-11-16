module.exports = {
    preset: 'ts-jest',
    testEnvironment: './jest/test_environment.js',
    moduleFileExtensions: ['ts', 'tsx', 'js'],
    testPathIgnorePatterns: ['/node_modules/', '/temp/', '/lib/', '/dist/'],
    watchPathIgnorePatterns: ['/node_modules/'],
    moduleNameMapper: {},
};
