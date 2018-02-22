using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

using CommonLibs.Web.LongPolling;

namespace TestWebSiteCore
{
	public class Startup
	{
		public const string			SessionKey			= "SomeSessionKey";
		internal const string		CustomObjectKey		= "DummyKey";
		private MessageHandler		MessageHandler		= null;

		// This method gets called by the runtime. Use this method to add services to the container.
		// For more information on how to configure your application, visit https://go.microsoft.com/fwlink/?LinkID=398940
		public void ConfigureServices(IServiceCollection services)
		{
			services.AddSession( options=>
				{
					options.IdleTimeout = TimeSpan.FromMinutes( 30 );
				} );
			services.AddSingleton( typeof(MessageHandler), CreateMessageHandler );
			services.AddMvc();
		}

		// This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
		public void Configure(IApplicationBuilder app, IHostingEnvironment env)
		{
			if( env.IsDevelopment() )
			{
				app.UseDeveloperExceptionPage();
			}

			app.UseSession();
			app.Use( async (context,next)=>
				{
					var sessionID = context.Session.GetString( SessionKey );
					if( string.IsNullOrWhiteSpace(sessionID) )
					{
						// Generate a securely pseudo-random sessionID
						var tokenData = new byte[32];
						var rnd = new System.Security.Cryptography.RNGCryptoServiceProvider();
						rnd.GetBytes( tokenData );
						sessionID = Convert.ToBase64String( tokenData );

						context.Session.SetString( SessionKey, sessionID );
					}
					await next();
				} );

			// Enable web sockets
			app.UseWebSockets();
			// Register the web socket URL that will handle messageHandler's requests ...
			app.UseMessageHandlerWebSocket( Routes.MessageHandlerWebSocket );
			// ... and/or register the HTTP URL that will handle messageHandler's requests
			app.UseMessageHandlerHttp( Routes.MessageHandlerHTTP );

			app.UseStaticFiles();
			app.UseMvc();
		}

		private MessageHandler CreateMessageHandler(IServiceProvider unScopedServiceProvider)
		{
			if( MessageHandler == null )
			{
				var tasksQueue = new CommonLibs.Utils.Tasks.TasksQueue{ MaximumConcurrentTasks=100 };
				var connectionList = new CommonLibs.Web.LongPolling.ConnectionList( tasksQueue, getSessionIDFromHttpContext:(context)=>context.Session.GetString(SessionKey) );
				// TODO: Need to call 'connectionList.SessionEnded()' at some point. But how to detect that a session has terminated, if ever ???
				connectionList.CheckInit += (message, httpContext)=>
					{
						// TODO: e.g. accept connections only from logged-in clients
						//return httpContext.Session.GetHasValidLoginCredentialOrSomething();
						return true;
					};
				connectionList.SessionAllocated.Add( (sessionID,httpContext)=>
					{
						// Register some custom object that need info from the HttpContext into the user's session for use by the message handlers
						var dummyNumber = httpContext.Session.GetString( Startup.SessionKey ).Length;
						connectionList.GetSessionCustomObject( sessionID, CustomObjectKey, ()=>new ExampleCustomObject(dummyNumber) );
					} );
				MessageHandler = new CommonLibs.Web.LongPolling.MessageHandler( tasksQueue, connectionList );
			}

			// Register all message handlers
			MessageHandler.AddMessageHandler( "Ping", (requestMessage)=>  // NB: Using the generic definition of 'AddMessageHandler()'
				{
					var responseMessage = CommonLibs.Web.LongPolling.Message.CreateResponseMessage( requestMessage );
					MessageHandler.SendMessageToConnection( requestMessage.SenderConnectionID, responseMessage );
				} );
			MessageHandler.AddMessageHandler( "TestCrash", Controllers.HomeController.TestCrashHandler );  // NB: Using the original definition of 'AddMessageHandler()'
			MessageHandler.AddMessageHandler( "TestTimeGet", Controllers.HomeController.TestTimeGet );  // NB: Using the simplified extended version of 'AddMessageHandler()'. See below.
			MessageHandler.AddMessageHandler( "TestTimePush", Controllers.HomeController.TestTimePush );  // NB: Using the simplified extended version of 'AddMessageHandler()'. See below.
			return MessageHandler;
		}
	}

	// Save everything that is required from outside an HttpContext that would be required by a message hander
	public class ExampleCustomObject
	{
		public readonly int	DummyNumber;
		internal ExampleCustomObject(int dummyNumber)
		{
			DummyNumber = dummyNumber;
		}
	}

	internal static class ExtensionMethods
	{
		// Example extension method to simplify message handlers definition
		internal static void AddMessageHandler(this CommonLibs.Web.LongPolling.MessageHandler messageHandler, string handlerType, Func<MessageHandler,Message,Message,Task<bool>> handler)
		{
			messageHandler.AddMessageHandler( handlerType, async (requestMessage)=>
				{
					// Get the custom object registered for this session (NB: Here, we are not in an HttpContext anymore)
					var connectionList = messageHandler.ConnectionList;
					var sessionID = connectionList.GetSessionID( requestMessage.SenderConnectionID );
					var customObject = (ExampleCustomObject)connectionList.GetSessionCustomObject( sessionID, Startup.CustomObjectKey );

					// Create the response message
					var responseMessage = CommonLibs.Web.LongPolling.Message.CreateResponseMessage( requestMessage );
					responseMessage["TestString"] = $"The length of my session ID is {customObject.DummyNumber}";  // TODO: Do something more useful with the customObject

					// Actual invokation of the handler here ; it will fill the response message.
					var sendRespone = await handler( messageHandler, requestMessage , responseMessage );
					if( sendRespone )
						// Send the response to the sender of the request
						messageHandler.SendMessageToConnection( requestMessage.SenderConnectionID, responseMessage );

					// Example: Could add custom exception handlers, common communication systems etc...
				} );
		}
	}
}
