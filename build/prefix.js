/* eslint-env node */
var fs = require('fs');
var glob = require('glob');
var util = require('./util');
var argv = require('minimist')(process.argv);
var inquirer = require('inquirer');
var prompt = inquirer.createPromptModule();

argv._.forEach(arg => {
    const tokens = arg.split('=');
    argv[tokens[0]] = tokens[1] || true;
});

var prefixFromInput = argv.p || argv.prefix;
const allFiles = [];

if (argv.h || argv.help) {
    console.log(`
        usage:

        prefix.js [-p{refix}=your_great_new_prefix][replace|append|cleanup]

        example:

        prefix.js // will guide you throught the process
        prefix.js -p=xyz replace // will replace any existing prefix with xyz
        prefix.js append // will prompt for a prefix to append to the current one

        note:
        
        if you don't want prefix.js to prompt you for input you have to provide all input parameters
    `);
} else {
    readAllFiles().then(startProcess);
}

function findExistingPrefix(data) {
    const res = data.match(new RegExp(`(${util.validClassName.source})-grid`));
    return res && res[1];
}

function getPrefix() {

    if (!prefixFromInput) {
        return prompt({name: 'prefix', message: 'enter a prefix', validate: (val, res) => val.length && val.match(util.validClassName) ? !!(res.prefix = val) : 'invalid prefix'}).then(res => res.prefix);
    } else if (util.validClassName.test(prefixFromInput)) {
        return Promise.resolve(prefixFromInput);
    } else {
        throw 'illegal prefix: ' + prefixFromInput;
    }
}

function readAllFiles(prefix) {

    const globs = [];

    globs.push(new Promise(res =>
        glob('dist/**/*.css', (err, files) => {
            var reads = [];
            files.forEach(file =>
                reads.push(util.read(file, data =>
                    allFiles.push({
                        file,
                        data,
                        replace: (data, needle, replace) => data.replace(new RegExp(`${needle}-` + /([a-z\d\-]+)/.source, 'g'), `${replace}-$1`)
                    })
                ))
            );
            Promise.all(reads).then(res);
        }
        )
    ));

    globs.push(new Promise(res =>
        glob('dist/**/*.js', (err, files) => {
            var reads = [];
            files.forEach(file =>
                reads.push(util.read(file, data =>
                    allFiles.push({
                        file,
                        data,
                        replace: (data, needle, replace) => data.replace(new RegExp(`${needle}-`, 'g'), `${replace}-`).replace(new RegExp(`(${needle})?UIkit`, 'g'), `${replace === 'uk' ? '' : replace}UIkit`)
                    })
                ))
            );
            Promise.all(reads).then(res);
        }
        )
    ));

    return Promise.all(globs);
}

function replacePrefix(from, to) {
    allFiles.forEach(({file, data, replace}) => {
        data = replace(data, from, to);
        fs.writeFileSync(file, data);
    });
}

function dispatchCommand(action, currentPrefix) {

    switch (action) {
    case 'cleanup':
        replacePrefix(currentPrefix, 'uk');
        break;
    case 'replace':
        getPrefix().then(prefix => replacePrefix(currentPrefix, prefix));
        break;
    case 'append':
        getPrefix().then(prefix => replacePrefix(currentPrefix, currentPrefix + prefix));
        break;
    case 'nothing':
    }

}

function startProcess() {

    // find existing prefix
    var currentPrefix;
    allFiles.some(({file, data}) => {
        currentPrefix = findExistingPrefix(data);
        return currentPrefix;
    });

    if (currentPrefix !== 'uk') {

        const actions = ['replace', 'append', 'cleanup', 'nothing'];

        const cliActions = actions.reduce((actions, action) => {
            if (argv[action]) {
                actions.push(action);
            }
            return actions;
        }, []);

        if (cliActions.length === 1) {
            dispatchCommand(cliActions[0], currentPrefix);
        } if (cliActions.length > 1) {
            throw `multiple actions found: ${cliActions.join(', ')}`;
        } else {
            prompt([{
                type: 'list',
                name: 'action',
                message: `this build is already prefixed with: '${currentPrefix}'. what do you want to do?`,
                default: 'replace',
                choices: actions
            }]).then(({action}) => dispatchCommand(action, currentPrefix));
        }
    } else {
        dispatchCommand('replace', currentPrefix);
    }
}