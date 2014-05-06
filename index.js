var path = require('path')
var helpers = require('broccoli-kitchen-sink-helpers')
var Writer = require('broccoli-writer');

module.exports = KssCompiler;
KssCompiler.prototype = Object.create(Writer.prototype);
KssCompiler.prototype.constructor = KssCompiler;

function KssCompiler(inputTree, options) {
  if (!(this instanceof KssCompiler)) return new KssCompiler(inputTree, options);
  this.inputTree = inputTree;
  this.options = options || {};
};

KssCompiler.prototype.write = function(readTree, destDir) {
  var self = this
  return readTree(this.inputTree).then(function(srcDir) {
    self.compile(srcDir, destDir, self.options.sassFile, self.options.templateDir);
  })
};

KssCompiler.prototype.compile = function(sourceDir, destDir, sassFile, templateDir) {
  var kss = require('kss'),
    preCompiler = kss.precompilers,
    handlebars = require('handlebars'),
    cleanCss = require('clean-css'),
    optimist = require('optimist'),
    marked = require('marked'),
    wrench = require('wrench'),
    stylus = require('stylus'),
    async = require('async'),
    util = require('util'),
    less = require('less'),
    path = require('path'),
    fs = require('fs'),
    template, styleguide,
    generatePage, generateStylesheet,
    options = {
      templateDirectory: templateDir,
      sourceDirectory: sourceDir,
      destinationDirectory: destDir
    },
    KSS_FAILED = false,
    argv;

  // Compile the Handlebars template
  template = fs.readFileSync(options.templateDirectory + '/index.html', 'utf8');
  template = handlebars.compile(template);

  // Create a new "styleguide" directory and copy the contents
  // of "public" over.
  try {
    fs.mkdirSync(options.destinationDirectory);
  } catch (e) {}

  wrench.copyDirSyncRecursive(
    options.templateDirectory + '/public',
    options.destinationDirectory + '/public'
  );

  // Generate the static HTML pages in the next tick, i.e. after the other functions have
  // been defined and handlebars helpers set up.
  process.nextTick(function() {
    less.render('@import "' + path.relative(process.cwd(), options.destinationDirectory) + '/public/kss.less";', function(err, css) {
      if (err) {
        console.error(err);
        throw err;
      }

      css = cleanCss.process(css);

      // Write the compiled LESS styles from the template.
      fs.writeFileSync(options.destinationDirectory + '/public/kss.css', css, 'utf8');

      kss.traverse(options.sourceDirectory, {
        multiline: true,
        markdown: true,
        markup: true,
        mask: preCompiler.mask
      }, function(err, sg) {
        if (err) throw err

        styleguide = sg;

        var sections = styleguide.section('*.'),
          i, sectionCount = sections.length,
          sectionRoots = [],
          currentRoot,
          rootCount, childSections = [],
          pages = {};

        // Accumulate all of the sections' first indexes
        // in case they don't have a root element.
        for (i = 0; i < sectionCount; i += 1) {
          currentRoot = sections[i].reference().match(/[0-9]*\.?/)[0].replace('.', '');

          if (!~sectionRoots.indexOf(currentRoot)) {
            sectionRoots.push(currentRoot);
          }
        }

        sectionRoots.sort();
        rootCount = sectionRoots.length;

        // Now, group all of the sections by their root
        // reference, and make a page for each.
        for (i = 0; i < rootCount; i += 1) {
          childSections = styleguide.section(sectionRoots[i] + '.*');

          generatePage(
            styleguide, childSections,
            sectionRoots[i], pages, sectionRoots
          );
        }

        generateIndex(styleguide, childSections, pages, sectionRoots);
        generateStylesheet(argv);
      });
    });
  });

  // Compile LESS/Stylus/CSS files into a single "style.css" if required
  generateStylesheet = function(argv) {
    var compilers = preCompiler.compilers,
      files

    files = ['sass'].map(function(type) {


      return {
        //files: Array.isArray(argv[key]) ? argv[key] : [argv[key]]
        files: [sassFile],
        type: type
      };
    });

    async.reduce(files, [], function(combined, group, next) {
      if (!group) return next(null, combined)


      async.map(group.files, function(filename, next) {
        var type = group.type,
          extension

          // Type-guessing for --style option
        if (!type) {
          extension = path.extname(filename).slice(1)
          Object.keys(compilers).forEach(function(name) {
            if (compilers[name].extensions.indexOf(extension) !== -1) type = name
          })
          type = type || 'css'
        }

        type = type.toLowerCase()

        if (type === 'css') return next(null, fs.readFileSync(filename, 'utf8'))
        compilers[type].render(filename, next)

      }, function(err, output) {
        if (err) return next(err)
        combined += '\n'
        combined += output.join('\n')
        return next(null, combined)
      });
    }, function(err, combined) {
      if (err) throw err
      saveStylesheet(combined)
    });
  };

  // Used by generateStylesheet to minify and then
  // save its final buffer to a single CSS file.
  saveStylesheet = function(buffer) {
    buffer = cleanCss.process(buffer.toString());
    fs.writeFileSync(
      options.destinationDirectory + '/public/style.css',
      buffer, 'utf8'
    );
  };

  // Renders the handlebars template for a section and saves it to a file.
  // Needs refactoring for clarity.
  generatePage = function(styleguide, sections, root, pages, sectionRoots) {
    fs.writeFileSync(options.destinationDirectory + '/section-' + root + '.html',
      template({
        styleguide: styleguide,
        sections: jsonSections(sections),
        rootNumber: root,
        sectionRoots: sectionRoots,
        overview: false,
        argv: argv || {}
      })
    );
  };

  // Equivalent to generatePage, however will take `styleguide.md` and render it
  // using first Markdown and then Handlebars
  generateIndex = function(styleguide, sections, pages, sectionRoots) {
    try {
      fs.writeFileSync(options.destinationDirectory + '/index.html',
        template({
          styleguide: styleguide,
          sectionRoots: sectionRoots,
          sections: jsonSections(sections),
          rootNumber: 0,
          argv: argv || {},
          overview: marked(fs.readFileSync(options.sourceDirectory + '/styleguide.md', 'utf8'))
        })
      );
    } catch (e) {
      console.log('...no styleguide overview generated:', e.message);
    }
  };

  // Convert an array of `KssSection` instances to a JSON object.
  jsonSections = function(sections) {
    return sections.map(function(section) {
      return {
        header: section.header(),
        description: section.description(),
        reference: section.reference(),
        depth: section.data.refDepth,
        deprecated: section.deprecated(),
        experimental: section.experimental(),
        modifiers: jsonModifiers(section.modifiers())
      };
    });
  };

  // Convert an array of `KssModifier` instances to a JSON object.
  jsonModifiers = function(modifiers) {
    return modifiers.map(function(modifier) {
      return {
        name: modifier.name(),
        description: modifier.description(),
        className: modifier.className()
      };
    });
  };

  /**
   * Equivalent to the {#if} block helper with multiple arguments.
   */
  handlebars.registerHelper('ifAny', function() {
    var argLength = arguments.length - 2,
      content = arguments[argLength + 1],
      success = true;

    for (var i = 0; i < argLength; i += 1) {
      if (!arguments[i]) {
        success = false;
        break;
      }
    }

    return success ? content(this) : content.inverse(this);
  });

  /**
   * Returns a single section, found by its reference number
   * @param  {String|Number} reference The reference number to search for.
   */
  handlebars.registerHelper('section', function(reference) {
    var section = styleguide.section(reference);
    if (!section) return false;

    return arguments[arguments.length - 1](section.data);
  });

  /**
   * Loop over a section query. If a number is supplied, will convert into
   * a query for all children and descendants of that reference.
   * @param  {Mixed} query The section query
   */
  handlebars.registerHelper('eachSection', function(query) {
    var sections,
      i, l, buffer = "";

    if (!query.match(/x|\*/g)) {
      query = new RegExp('^' + query + '$|^' + query + "\\..*");
    }
    sections = styleguide.section(query);
    if (!sections) return '';

    l = sections.length;
    for (i = 0; i < l; i += 1) {
      buffer += arguments[arguments.length - 1](sections[i].data);
    }

    return buffer;
  });

  /**
   * Loop over each section root, i.e. each section only one level deep.
   */
  handlebars.registerHelper('eachRoot', function() {
    var sections,
      i, l, buffer = "";

    sections = styleguide.section('x');
    if (!sections) return '';

    l = sections.length;
    for (i = 0; i < l; i += 1) {
      buffer += arguments[arguments.length - 1](sections[i].data);
    }

    return buffer;
  });

  /**
   * Equivalent to "if the current section is X levels deep". e.g:
   *
   * {{#refDepth 1}}
   *   ROOT ELEMENTS ONLY
   *  {{else}}
   *   ANYTHING ELSE
   * {{/refDepth}}
   */
  handlebars.registerHelper('whenDepth', function(depth, context) {
    if (!(context && this.refDepth)) {
      return '';
    }
    if (depth == this.refDepth) {
      return context(this);
    }
    if (context.inverse) {
      return context.inverse(this);
    }
  });

  /**
   * Similar to the {#eachSection} helper, however will loop over each modifier
   * @param  {Object} section Supply a section object to loop over it's modifiers. Defaults to the current section.
   */
  handlebars.registerHelper('eachModifier', function(section) {
    var modifiers, i, l, buffer = '';

    // Default to current modifiers, but allow supplying a custom section
    if (section.data) modifiers = section.data.modifiers;
    modifiers = modifiers || this.modifiers || false;

    if (!modifiers) return {};

    l = modifiers.length;
    for (i = 0; i < l; i++) {
      buffer += arguments[arguments.length - 1](modifiers[i].data || '');
    }
    return buffer;
  });

  /**
   * Outputs a modifier's markup, if possible.
   * @param  {Object} modifier Specify a particular modifier object. Defaults to the current modifier.
   */
  handlebars.registerHelper('modifierMarkup', function(modifier) {
    modifier = arguments.length < 2 ? this : modifier || this || false;

    if (!modifier) {
      return false;
    }

    // Maybe it's actually a section?
    if (modifier.modifiers) {
      return new handlebars.SafeString(
        modifier.markup
      );
    }

    // Otherwise return the modifier markup
    return new handlebars.SafeString(
      new kss.KssModifier(modifier).markup()
    );
  });

  /**
   * Quickly avoid escaping strings
   * @param  {String} arg The unescaped HTML
   */
  handlebars.registerHelper('html', function(arg) {
    return new handlebars.SafeString(arg || '');
  });

  process.on('exit', function() {
    if (!KSS_FAILED) {
    }
  });

  process.on('uncaughtException', function(err) {
    console.log(err.message);
    console.log(errgg.stack);
    KSS_FAILED = true;
    process.exit(1);
  })
};
