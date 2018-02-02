
var gulp = require('gulp');
// var concat = require('gulp-concat');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var del = require('del');
var browserify = require('browserify');
var tsify = require('tsify');
//var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
// var sass = require('gulp-sass');

gulp.task( 'default', [	'site.js'/*, 'site.min.js', 'style.css'*/ ] );

gulp.task( 'clean', function()
{
	return del( [	'./wwwroot/js/site*.js',
					'./wwwroot/js/site*.map',
					'./wwwroot/css/style.css',
					'./wwwroot/css/style.css.map',
				] );
} );

// Compile typescript files (using tsify+browserify) into './wwwroot/js/xxx.js'
gulp.task( 'site.js', function(){ return buildInterwebJs('site.js', false); })
gulp.task( 'site.min.js', function(){ return buildInterwebJs('site.min.js', true); })  // <== NB: Not used but contains additional compilation checks => Leaving it ...
function buildInterwebJs(fileName, releaseMode)
{
	// cf. https://www.typescriptlang.org/docs/handbook/compiler-options.html
	var tsifyParms = {};
	if( releaseMode )
	{
		tsifyParms.noImplicitAny = true;
		tsifyParms.noUnusedLocals = true;
	}
	var b = browserify({ debug:true })
				.add( './Views/Home/Index.ts' )
				.plugin( tsify, tsifyParms );

	var stream = b.bundle()  // Execute Browserify
			.pipe( source(fileName) )  // Destination filename
			.pipe( buffer() )
			.pipe( sourcemaps.init({ loadMaps: true }) );
//	if( releaseMode )
//		stream = stream
//			.pipe( uglify() );  // Execute uglify		<== Fails to work with ES6 !!
	stream = stream
			.on( 'error', function(error){ console.error(error.toString()); } )
			.pipe( sourcemaps.write('./') )
			.pipe( gulp.dest('./wwwroot/js/') );  // Destination directory
	return stream;
};

// gulp.task( 'style.css', function()
// {
// 	return gulp.src( './Views/**/*.scss' )
// 		.pipe( sourcemaps.init({ loadMaps: true }) )
// 		.pipe( sass().on('error', sass.logError) )
// 		.pipe( concat('style.css') )
// 		.pipe( sourcemaps.write('./') )
// 		.pipe( gulp.dest('./wwwroot/css') );
// } );
