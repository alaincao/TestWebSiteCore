using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using Microsoft.AspNetCore.Mvc;

namespace TestWebSiteCore.Controllers
{
	public class HomeController : Controller
	{
		public HomeController()
		{
		}

		[HttpGet( Routes.Home )]
		[HttpHead( Routes.Home )]
		public IActionResult Index()
		{
			return View();
		}
	}
}
