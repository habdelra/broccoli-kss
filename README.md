# broccoli-kss

The broccoli-kss plugin generates a living styleguide based on the [KSS-Node project](https://github.com/hughsk/kss-node). Note that currently this implementation supports only SASS.

## Installation

```bash
npm install --save-dev broccoli-kss
```

## Usage

```js
var compileKss = require('broccoli-kss');

var outputTree = compileKss(inputTree, options);
```

* **`inputTrees`**: An broccoli tree that is the KSS source directory containing all your SCSS files to be parsed for styleguide documentation.

* **`options`**: A hash of options for kss-node. Supported options are
  `templateDir`, `sassFile`, `destDir`.
  * **`templateDir`**: the directory where your KSS template files live for custom styling of KSS output.
  * **`sassFile`**: the top level *.scss file containing the styleguide documentation.
  * **`destDir`**: the output directory (relative to the broccoli build output folder) to place the generated stylesheet.


### Example

```js
var inputTree = pickFiles('kss', {
  srcDir: '/',
  destDir: '/'
});
var styleguide = compileKss(inputTree, {
  templateDir: 'kss/template',
  sassFile: 'kss/styles.scss',
  destDir: 'styleguide'
});
```

Where your KSS documentation lives under ```{project_home}/kss```, your KSS templates live under the ```{project_home}/kss/templates``` folder, and the top level scss file for your documentation lives is at ```{project_home}/kss/styles.scss```. This will output your style guide in the folder:  ```{broccoli_output}/styleguide```.
