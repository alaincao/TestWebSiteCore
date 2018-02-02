using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using Microsoft.AspNetCore.Mvc;

using CommonLibs.Web.LongPolling.Utils;

namespace TestWebSiteCore.Controllers
{
	using MessageHandler = CommonLibs.Web.LongPolling.MessageHandler;
	using Message = CommonLibs.Web.LongPolling.Message;

	public class HomeController : Controller
	{
		public HomeController()
		{
		}

		[HttpGet( Routes.Home )]
		[HttpHead( Routes.Home )]
		public IActionResult Index()
		{
			// Use WebSocket middleware:
			ViewBag.ClientParameters = Newtonsoft.Json.JsonConvert.SerializeObject(
											CommonLibs.Web.LongPolling.JSClient.CreateClientParameters(
																						resolveUrl : Url.Content,
																						webSocketHandlerUrl : "~"+Routes.MessageHandlerWebSocket,
																						debug : true )  // NB: 'debug' will log all sent/received messages to the JavaScript's console
										);
			// Or use HTTP middleware:
			// ViewBag.ClientParameters = Newtonsoft.Json.JsonConvert.SerializeObject(
			// 								CommonLibs.Web.LongPolling.JSClient.CreateClientParameters(
			// 																			resolveUrl : Url.Content,
			// 																			httpHandlerUrl : "~"+Routes.MessageHandlerHTTP,
			// 																			debug : true )  // NB: 'debug' will log all sent/received messages to the JavaScript's console
			// 							);

			return View();
		}

		/// <summary>
		/// Example message handler that throws an exception
		/// </summary>
		internal static void TestCrashHandler(Message requestMessage)
		{
			int a = 0;
			int b = 1;
			a = b/a;
		}

		/// <summary>
		/// Example message handler that returns the time of the server (once)
		/// </summary>
		internal static Task<bool> TestTimeGet(MessageHandler messageHandler, Message requestMessage, Message responseMessage)
		{
			var includeEpoch = requestMessage.TryGetBool( "includeEpoch" ) ?? false;

			var now = DateTime.Now;
			responseMessage[ "time" ] = now.ToLongTimeString();
			responseMessage[ "parts" ] = new {
					Hours = now.Hour,
					Minutes = now.Minute,
					Seconds = now.Second };
			if( includeEpoch )
				responseMessage[ "epoch" ] = ( now.ToUniversalTime() - new DateTime(1970, 1, 1) ).TotalSeconds;

			return Task.FromResult( true );  // Send the 'responseMessage' to the sender connection
		}

		/// <summary>
		/// Example message handler that push the time to the client ('repeat' times)
		/// </summary>
		internal static async Task<bool> TestTimePush(MessageHandler messageHandler, Message requestMessage, Message unusedResponseMessage)
		{
			var includeEpoch = requestMessage.TryGetBool( "includeEpoch" ) ?? false;
			var repeat = requestMessage.TryGetInt( "repeat" ) ?? 0;
			if( repeat <= 0 )
				throw new ArgumentException( $"Invalid value {repeat} for 'repeat' parameter" );

			for( var i=0; i<repeat; ++i )
			{
				var responseMessage = CommonLibs.Web.LongPolling.Message.CreateResponseMessage( requestMessage );

				var now = DateTime.Now;
				responseMessage[ "time" ] = now.ToLongTimeString();
				responseMessage[ "parts" ] = new {
						Hours = now.Hour,
						Minutes = now.Minute,
						Seconds = now.Second };
				responseMessage[ "repeatsToGo" ] = repeat - i - 1;
				if( includeEpoch )
					responseMessage[ "epoch" ] = ( now.ToUniversalTime() - new DateTime(1970, 1, 1) ).TotalSeconds;

				messageHandler.SendMessageToConnection( requestMessage.SenderConnectionID, responseMessage );
				await Task.Delay( 1000 );
			}

			return false;  // Don't send the 'unusedResponseMessage' response message
		}
	}
}
