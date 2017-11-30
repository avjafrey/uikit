/* eslint-env node */
var glob = require('glob');
var util = require('./util');
var argv = require('minimist')(process.argv.slice(2));

argv._.forEach(arg => {
    const tokens = arg.split('=');
    argv[tokens[0]] = tokens[1] || true;
});

const inquirer = require('inquirer');
const prompt = inquirer.createPromptModule();

const currentScopeRegex = /\/\* scoped: ([^\*]*) \*\//;
const currentScopeLegacyRegex = new RegExp('\.(uk-scope)');
const allFiles = [];
var currentScope;

if (argv.h || argv.help) {
    console.log(`
        usage:

        scope.js [-scope=your_great_new_scope_name][replace|append|cleanup]

        example:

        scope.js // will guide you throught the process
        scope.js -scope=uk-scope replace // will replace any existing scope with uk-scope
        scope.js append // will prompt for a scopename to append to the current one

        note:

        if you don't want scope.js to prompt you for input you have to provide all input parameters
    `);
} else {
    readAllFiles().then(startProcess);
}

function getNewScope() {

    const scopeFromInput = typeof argv.scope === 'string' && argv.scope;

    if (!scopeFromInput) {
        return prompt({name: 'scope', default: 'uk-scope', message: 'enter a scope-name', validate: (val, res) => val.length && val.match(util.validClassName) ? !!(res.prefix = val) : 'invalid scope-name'}).then(res => res.prefix);
    } else if (util.validClassName.test(scopeFromInput)) {
        return Promise.resolve(scopeFromInput);
    } else {
        throw 'illegal scope-name: ' + scopeFromInput;
    }
}

function isScoped(data) {
    var varName = data.match(currentScopeRegex);
    if (varName) {
        return varName[1];
    } else {
        varName = data.match(currentScopeLegacyRegex);
    }
    return varName && varName[1];
}

function doScope(scopeFromInput) {

    if (currentScope === scopeFromInput) {
        return Promise.reject('already scoped with:' + currentScope);
    }

    const scopes = [];
    allFiles.forEach(store => {

        scopes.push(util.renderLess(`.${scopeFromInput} {\n${store.data}\n}`)
                        .then(output =>
                            store.data = `/* scoped: ${currentScope ? currentScope + ' ' + scopeFromInput : scopeFromInput} */` +
                                    output.replace(new RegExp(`.${scopeFromInput} ${/{(.|[\r\n])*?}/.source}`), '')
                                          .replace(new RegExp(`.${scopeFromInput} ${/\s((\.(uk-(drag|modal-page|offcanvas-page|offcanvas-flip)))|html)/.source}`, 'g'), '$1')
                        )
        );
    });

    return Promise.all(scopes);

}

function store() {
    const writes = [];
    allFiles.forEach(({file, data}) => writes.push(util.write(file, data).then(util.minify)));
    return Promise.all(writes);
}

function cleanUp(currentScope) {
    allFiles.forEach((store) => {
        const string = currentScope.split(' ').map(scope => `.${scope}`).join(' ');
        store.data = store.data.replace(new RegExp(/ */.source + string + / ({[\s\S]*?})?/.source, 'g'), '') // replace classes
                   .replace(new RegExp(currentScopeRegex.source, 'g'), ''); // remove scope comment
    });

    currentScope = null;
    return Promise.resolve();
}

function readAllFiles() {
    return new Promise(res => {
        glob('dist/**/!(*.min).css', (err, files) => {
            //read files, check scopes
            const reads = [];
            files.forEach(file => {
                const promise = util.read(file, data => {
                    allFiles.push({file, data});
                    const scope = isScoped(data);
                    if (currentScope && scope !== currentScope) {
                        throw 'scopes used on current css differ from file to file.';
                    }
                    currentScope = scope;
                });
                reads.push(promise);
            });
            Promise.all(reads).then(res);
        });

    });
}

function dispatchAction(action, currentScope) {

    switch (action) {
    case 'cleanup':
        cleanUp(currentScope).then(store).catch(console.log);
        break;
    case 'replace':
        cleanUp(currentScope).then(getNewScope).then(doScope).then(store).catch(console.log);
        break;
    case 'append':
        getNewScope().then(doScope).then(store).catch(console.log);
        break;
    case 'nothing':
    }
}

function startProcess() {

    if (currentScope) {

        const actions = ['replace', 'append', 'cleanup', 'nothing'];

        const cliActions = actions.reduce((actions, action) => {
            if (argv[action]) {
                actions.push(action);
            }
            return actions;
        }, []);

        if (cliActions.length === 1) {
            dispatchAction(cliActions[0], currentScope);
        } else if (cliActions.length > 1) {
            throw `multiple actions found: ${cliActions.join(', ')}`;
        } else {
            prompt([{
                type: 'list',
                name: 'action',
                message: `the css is already scoped with: '${currentScope}'. what do you want to do?`,
                default: 'replace',
                choices: ['replace', 'append', 'cleanup', 'nothing']
            }]).then(res => dispatchAction(res.action, currentScope));
        }

    } else {

        dispatchAction('append');
    }
}