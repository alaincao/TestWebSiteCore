
// NB: Need to export something so this file is a module ...
export var dummy : any;

declare global
{
	interface Window
	{
		home_index_init : ()=>void;
	}
}

window.home_index_init = function init()
{
	console.log( 'Hello world' );
}
