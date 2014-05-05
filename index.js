var Writer = require('broccoli-writer');
var kss = require('kss-node');
var options = {
  markdown: false
};

module.exports = KssCompiler;
KssCompiler.prototype = Object.create(Writer.prototype);
KssCompiler.prototype.constructor = KssCompiler;

function KssCompiler(sourceTree, options) {
  if (!(this instanceof KssCompiler)) return new KssCompiler(sourceTree, options);
  this.sourceTree = sourceTree
  options = options || {}
  this.kssOptions = {
    templateDir: options.templateDir,
    sassFile: options.sassFile
  }
};

KssCompiler.prototype.write = function(readTree, destDir) {
  readTree(this.sourceTree).then(function(srcDir){
    kss(srcDir, destDir, this.kssOptions.templateDir, this.kssOptions.sassFile);
  });
};
