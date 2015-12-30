/**
 * Heavily based on https://github.com/sebmck/lerna code which is licensed under
 * MIT license.
 *
 * Copyright (c) 2015 Sebastian McKenzie <sebmck@gmail.com>
 * Copyright (c) 2015 Andrey Popp <8mayday@gmail.com>
 */
var mkdirp = require("mkdirp");
var rimraf = require("rimraf");
var child = require("child_process");
var async = require("async");
var path = require("path");
var fs = require("fs");

function bootstrap(config) {
  // get packages
  var packages = [];
  fs.readdirSync(config.packagesLoc).forEach(function (loc) {
    var name = path.basename(loc);
    if (name[0] === ".") return;

    var pkgLoc = path.resolve(path.join(config.packagesLoc, name, "package.json"));
    if (!fs.existsSync(pkgLoc)) return;

    var pkg = require(pkgLoc);
    packages.push({
      folder: name,
      pkg: pkg,
      name: pkg.name
    });
  });

  var completed = false;

  async.parallelLimit(packages.map(function (root) {
    return function (done) {
      var tasks = [];
      var nodeModulesLoc = path.join(config.packagesLoc, root.folder, "node_modules");

      tasks.push(function (done) {
        mkdirp(nodeModulesLoc, done);
      });

      tasks.push(function (done) {
        async.each(packages, function (sub, done) {
          var ver = false;
          if (root.pkg.dependencies) ver = root.pkg.dependencies[sub.name];
          if (root.pkg.devDependencies && !ver) ver = root.pkg.devDependencies[sub.name];
          if (!ver) return done();

          /* TODO: Need to do proper semver comparison?
          // ensure that this is referring to a local package
          if (ver[0] !== "^" || ver[1] !== config.currentVersion[0]) return done();
          */

          var linkSrc = path.resolve(path.join(config.packagesLoc, sub.folder));
          var linkDest = path.join(nodeModulesLoc, sub.name);

          rimraf(linkDest, function (err) {
            if (err) return done(err);

            mkdirp(linkDest, function (err) {
              if (err) return done(err);

              fs.writeFile(path.join(linkDest, "package.json"), JSON.stringify({
                name: sub.name,
                version: require(path.resolve(path.join(linkSrc, "package.json"))).version
              }, null, "  "), function (err) {
                if (err) return done(err);

                fs.writeFile(path.join(linkDest, "index.js"), 'module.exports = require("' + linkSrc + '");', done);
              });
            });
          });
        }, done);
      });

      tasks.push(function (done) {
        if (!completed) {
          console.log('Bootstrapped:', root.name);
        }
        done();
      });

      async.series(tasks, done);
    };
  }), 4, function (err) {
    // don't display the ticker if we hit an error and we still have workers
    completed = true;

    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      console.log("Successfully bootstraped " + packages.length + " packages.");
      process.exit();
    }
  });
};

bootstrap({
  packagesLoc: './',
  currentVersion: require('../package.json').version,
});
