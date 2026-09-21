module.exports = {
    default: {
        paths: ['tests/citi/features/*.feature'],
        require: ['tests/citi/gherkin/support/*.cjs', 'tests/citi/gherkin/steps/*.cjs'],
        format: ['progress'],
        parallel: 0,
        retry: 0,
        strict: true
    }
};
