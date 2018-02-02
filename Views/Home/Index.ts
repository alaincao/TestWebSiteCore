
import { Client, MessageHandler, ClientStatus } from "../../CommonLibs/Web/LongPolling/JSClient/Client";

declare global
{
	interface Window
	{
		home_index_init : (messageHandlerParameters:any)=>void;
		messageHandler : MessageHandler;
	}
}

window.home_index_init = function init(messageHandlerParameters:any)
{
	var messageHandler = Client( messageHandlerParameters )
							.onStatusChanged( (status)=>
								{
									let str;
									switch( status )
									{
										case ClientStatus.CONNECTED:	str = 'Connected';		break;
										case ClientStatus.DISCONNECTED:	str = 'Disconnected';	break;
										case ClientStatus.CONNECTED:	str = 'Connected';		break;
										case ClientStatus.PENDING:		str = 'Pending';		break;
										case ClientStatus.RUNNING:		str = 'Running';		break;
									}
									$('#client-status').text( str );
								} )
							.onInternalError( (msg)=>
								{
									// Something that should not happen ...
									console.error( 'An internal error occured:', msg );
								} )
							.onMessageHandlerFailed( (msg)=>
								{
									// Something that should not happen either (e.g. a JSON response could not be parsed) ...
									console.error( 'A message handler failed:', msg );
								} )
							.onConnectionIdReceived( (connectionID)=>
								{
									// The connection to the server is now established
								} );
	messageHandler.bind( 'exception', (evt,msg)=>
					{
						// The server sent a generic exception message (e.g. a message sent to an inexistent message handler)
						console.error( 'The server sent an exception:', msg );
					} );
	messageHandler.start();

	// Method 1: Send a 'TestTimeGet' message every seconds ...
	setInterval( function()
		{
			const request = {	type : 'TestTimeGet',
								includeEpoch : true };
			messageHandler.sendMessage( request, (evt,response)=>
				{
					const serverTime = `${response['time']} (Unix epoch: ${response['epoch']})`;
					$('#server-time-get').text( serverTime );
				} );
		}, 1000 );

	// Method 2: Ask the server to push the time
	{
		// Register a handler for the response messages
		messageHandler.bind( 'receive-time-from-server', (evt,response)=>
			{
				const serverTime = `${response['time']} (Unix epoch: ${response['epoch']}) ; To go: ${response['repeatsToGo']}`;
				$('#server-time-push').text( serverTime );
			} );

		$('#btn-test-push').click( ()=>
			{
				// Send a 'TestTimePush' message ...
				const request = {	type : 'TestTimePush',
									reply_to_type : 'receive-time-from-server',  // ... and receive its response to the 'receive-time-from-server' handler registered above
									repeat : 10,  // Push 10 responses
									includeEpoch : true };
				messageHandler.sendMessage( request );
			} );
	}

	// Example server exception
	$('#btn-test-crash').click( ()=>
		{
			// Send a 'TestCrash' message
			messageHandler.sendMessage( { type : 'TestCrash' }, (evt,response)=>
				{
					// Use the 2nd parameter to define the response handler instead of using 'messageHandler.bind()' as above
					const json = JSON.stringify( response, null, 4 );
					showTextDialogMessage( json, 'The server responded:' );
				} );
		} );

	window.messageHandler = messageHandler;  // NB: Only so it can be used from the JavaScript's console
}

function showTextDialogMessage(msg, title)
{
	var $root = $('<div/>').attr( 'title', title );
	if( msg instanceof jQuery )
		$root.append( msg );
	else
		$root.append( $('<pre/>').text(msg) );
	$(document.body).append( $root );
	$root.dialog();
}
