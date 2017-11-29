var glob = require('glob');
var util = require('./util');
var argv = require('minimist')(process.argv.slice(2));
const inquirer = require('inquirer');
const prompt = inquirer.createPromptModule();
var newScope = argv.scope || 'uk-scope';

const currentScopeRegex = /\/\* scoped: ([^\*]*) \*\//;
const currentScopeLegacyRegex = new RegExp('\.(uk-scope)');
function isScoped(data) {
    var varName = data.match(currentScopeRegex);
    if (varName) {
        return varName[1];
    } else {
        varName = data.match(currentScopeLegacyRegex);
    }
    return varName && varName[1];
}

const allFiles = [];
var currentScope;

function doScope({file, data}) {
    return util.renderLess(`.${newScope} {\n${data}\n}`)
            .then(output => ({
                file,
                data: `/* scoped: ${currentScope ? currentScope + ' ' + newScope : newScope} */` +
                    output.replace(new RegExp(`.${newScope} ${/{(.|[\r\n])*?}/.source}`), '')
                    .replace(new RegExp(`.${newScope} ${/\s((\.(uk-(drag|modal-page|offcanvas-page|offcanvas-flip)))|html)/.source}`, 'g'), '$1')
            })
            );
}

function store({file, data}) {
    return util.write(file, data).then(util.minify);
}

function cleanUp({file, data}) {
    const string = currentScope.split(' ').map(scope => `.${scope}`).join(' ');
    data = data.replace(new RegExp(/ */.source + string + / ({[\s\S]*?})?/.source, 'g'), '').replace(new RegExp(currentScopeRegex.source, 'g'), '');
    return Promise.resolve({file, data});
}

glob('dist/**/!(*.min).css', (err, files) => {

    //read files, check scopes
    const reads = [];
    files.forEach(file => {
        const promise = util.read(file, data => {
            allFiles.push({file, data});
            const scope = isScoped(data);
            if (currentScope && scope !== currentScope) {
                throw 'scopes used on current css differ.';
            }
            currentScope = scope;
        });
        reads.push(promise);
    });

    Promise.all(reads).then(() => {

        if (currentScope) {
            prompt([{
                type: 'list',
                name: 'action',
                message: `the css is already scoped with: '${currentScope}'. what do you want to do?`,
                default: 'replace',
                choices: ['replace', 'append', 'cleanup', 'nothing']
            }]).then(res => {
                switch (res.action) {
                case 'cleanup':
                    allFiles.forEach(data => cleanUp(data).then(store));
                    break;
                case 'replace':
                    allFiles.forEach(data => cleanUp(data).then(store));
                    currentScope = null;
                    allFiles.forEach(data => doScope(data).then(store));
                    break;
                case 'append':
                    allFiles.forEach(data => doScope(data).then(store));
                    break;
                case 'nothing':
                }
            });
        } else {
            allFiles.forEach(data => doScope(data).then(store));
        }
    });

});

