namespace TestWebSiteCore
{
	internal static class Routes
	{
		internal const string	Home					= "/";
		internal const string	MessageHandlerWebSocket	= "/messages";
		internal const string	MessageHandlerHTTP		= MessageHandlerWebSocket;  // NB: Can be the same, but not mandatory
	}
}
