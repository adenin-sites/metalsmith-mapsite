/**
 * Dependencies
 */
var isundefined = require('lodash.isundefined');
var is = require('is');
var match = require('multimatch');
var path = require('path');
var pickby = require('lodash.pickby');
var slash = require('slash');
var sm = require('sitemap');
var fs = require('fs');

/**
 * Export plugin
 */
module.exports = plugin;

/**
 * Metalsmith plugin for generating a sitemap.
 *
 * @param {String or Object} options
 *   @property {Date} lastmod (optional)
 *   @property {String} changefreq (optional)
 *   @property {Boolean} omitExtension (optional)
 *   @property {Boolean} omitIndex (optional)
 *   @property {String} hostname
 *   @property {String} output (optional)
 *   @property {String} pattern (optional)
 *   @property {String} priority (optional)
 *   @property {String} jsonFile (optional)
 * @return {Function}
 */
function plugin(opts){
  /**
   * Init
   */
  opts = opts || {};

  // Accept string option to specify the hostname
  if (typeof opts === 'string') {
    opts = { hostname: opts };
  }

  // A hostname should be specified
  if (!opts.hostname) {
    throw new Error('"hostname" option required');
  }

  if (opts.jsonFile && path.extname(opts.jsonFile) != '.json') {
    throw new Error('"jsonFile" must point to a JSON file with extension .json');
  }

  // Map options to local variables and set defaults
  var changefreq = opts.changefreq || 'weekly';
  var hostname = opts.hostname;
  var lastmod = opts.lastmod;
  var omitExtension = opts.omitExtension;
  var omitIndex = opts.omitIndex;
  var output = opts.output || 'sitemap.xml';
  var pattern = opts.pattern || '**/*.html';
  var priority = isNaN(opts.priority) ? 0.5 : opts.priority; // priority might be 0.0 which evaluates to false
  var staticURLs = opts.jsonFile || false;

  var chompRight = function(input, suffix) {
    if (input.endsWith(suffix)) {
      return input.slice(0, input.length - suffix.length);
    } else {
      return input;
    }
  };

  /**
   * Main plugin function
   */
  return function(files, metalsmith, done) {
    // Create sitemap object
    var sitemap = sm.createSitemap ({
      hostname: hostname
    });

    // Checks whether files should be processed
    function check(file, frontmatter) {
      // Only process files that match the pattern
      if (!match(file, pattern)[0]) {
        return false;
      }

      // Don't process private files
      if (frontmatter.private) {
        return false;
      }

      return true;
    }

    // Builds a url
    function buildUrl(file, frontmatter) {
      // Convert any windows backslash paths to slash paths
      var normalizedFile = slash(file);
      var r = "";

      // Frontmatter settings take precedence
      if (!r && is.string(frontmatter.canonical)) {
        r = frontmatter.canonical;
      }

      // Remove index.html if necessary
      if (!r && omitIndex && path.basename(normalizedFile) === 'index.html') {
        r = chompRight(normalizedFile, 'index.html');
      }

      // Remove extension if necessary
      if (!r && omitExtension) {
        r = chompRight(normalizedFile, path.extname(normalizedFile));
      }

      // Otherwise just use the normalized 'file' entry
      if(!r) r = normalizedFile;

      if(!r.endsWith("/")) r = r + "/";

      return r;
    }

    Object.keys(files).forEach(function(file) {
      // Get the current file's frontmatter
      var frontmatter = files[file];

      // Only process files that pass the check
      if (!check(file, frontmatter)) {
        return;
      }

      // Create the sitemap entry (reject keys with falsy values)
      var entry = pickby({
        changefreq: frontmatter.changefreq || changefreq,
        priority: frontmatter.priority || priority,
        lastmod: frontmatter.lastmod || lastmod
      }, function(item) { return !isundefined(item); });
      
      if('lastmod' in entry) {
        entry.lastmod = new Date(entry.lastmod).toUTCString();
      }

      // Add the url (which is allowed to be falsy)
      entry.url = buildUrl(file, frontmatter);

      // Add the entry to the sitemap
      sitemap.add(entry);
    });

    // if specified, add entries from a JSON file
    if (staticURLs) {
      var staticObjects = JSON.parse(fs.readFileSync(staticURLs, 'utf8'));

      for (var i in staticObjects) {
        // Get the current file's frontmatter
        var frontmatter = staticObjects[i];

        // Create the sitemap entry (reject keys with falsy values)
        var entry = pickby({
          changefreq: frontmatter.changefreq || changefreq,
          priority: frontmatter.priority || priority,
          lastmod: frontmatter.lastmod || lastmod
        }, function(item) { return !isundefined(item); });
        
        if('lastmod' in entry) {
          entry.lastmod = new Date(entry.lastmod).toUTCString();
        }

        // Add the url (which is allowed to be falsy)
        entry.url = frontmatter.path ? hostname + "/" + frontmatter.path : '';

        // Add the entry to the sitemap
        sitemap.add(entry);
      }
    }

    // Create sitemap in files
    files[output] = {
      contents: new Buffer(sitemap.toString())
    };

    done();
  };
}
