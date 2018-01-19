using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace TestWebSiteCore
{
	public class Startup
	{
		public const string		SessionKey	= "SomeSessionKey";

		// This method gets called by the runtime. Use this method to add services to the container.
		// For more information on how to configure your application, visit https://go.microsoft.com/fwlink/?LinkID=398940
		public void ConfigureServices(IServiceCollection services)
		{
			services.AddSession( options=>
				{
					options.IdleTimeout = TimeSpan.FromMinutes( 30 );
				} );
			services.AddMvc();
		}

		// This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
		public void Configure(IApplicationBuilder app, IHostingEnvironment env)
		{
			if (env.IsDevelopment())
			{
				app.UseDeveloperExceptionPage();
			}

			app.UseSession();
			app.Use( async (context,next)=>
				{
					var sessionID = context.Session.GetString( SessionKey );
					if( string.IsNullOrWhiteSpace(sessionID) )
					{
						// Generate a securely pseudo-random sessionID (cf. ASP's SessionID)
						// The aim is to have a string that uniquely identifies the user across it's different page requests
						// => The resulting cookie must NOT be cryptographically guessable or another user could spoof it's identity
						// E.g. example below in case the cookies are not encrypted
						var tokenData = new byte[32];
						var rnd = new System.Security.Cryptography.RNGCryptoServiceProvider();
						rnd.GetBytes( tokenData );
						sessionID = Convert.ToBase64String( tokenData );

						context.Session.SetString( SessionKey, sessionID );
					}
					await next();
				} );

			app.UseStaticFiles();
			app.UseMvc();
		}
	}
}
