import Link from "next/link";
import { sitePath, siteAsset } from "@/lib/site/paths";

// The company website's footer — the original's markup and copy, verbatim.
export default function SiteFooter() {
  const link = "text-slate-400 hover:text-white transition-colors";
  return (
    <footer className="bg-slate-900 text-white py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-4">
            <Link href={sitePath("/")}>
              <img alt="Korman Logo" loading="lazy" width={292} height={97} className="mb-6" src={siteAsset("images/Korman_CORPORATE_logo_WHT.png")} />
            </Link>
            <address className="not-italic text-slate-400 mb-4">
              8 Neshaminy Interplex Suite 400
              <br />
              Trevose, PA 19053
            </address>
            <div className="text-slate-400">
              <p className="mb-1"><a href="tel:2152445100" className="hover:text-white transition-colors">215.244.5100</a></p>
              <p><a href="mailto:info@kormancommercial.com" className="hover:text-white transition-colors">info@kormancommercial.com</a></p>
            </div>
          </div>
          <div className="md:col-span-2">
            <h3 className="text-lg font-medium mb-4">Company</h3>
            <ul className="space-y-3">
              <li><Link className={link} href={sitePath("/company")}>Company</Link></li>
              <li><Link className={link} href={sitePath("/contact")}>Contact</Link></li>
            </ul>
          </div>
          <div className="md:col-span-2">
            <h3 className="text-lg font-medium mb-4">Current Properties</h3>
            <ul className="space-y-3">
              <li><Link className={link} href={sitePath("/office")}>Office</Link></li>
              <li><Link className={link} href={sitePath("/retail")}>Retail</Link></li>
              <li><Link className={link} href={sitePath("/residential")}>Residential</Link></li>
              <li><Link className={link} href={sitePath("/land")}>Land</Link></li>
            </ul>
          </div>
          <div className="md:col-span-3 md:pl-14">
            <h3 className="text-lg font-medium mb-4">Resources</h3>
            <ul className="space-y-3">
              <li><a href="https://www.rentpayment.com/pay/login.html" target="_blank" rel="noopener noreferrer" className={link}>Pay Rent</a></li>
              <li><Link className={link} href={sitePath("/available-space")}>Available Space</Link></li>
              <li><Link className={link} href={sitePath("/maintenance")}>Maintenance</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-16 pt-16 border-t border-slate-800">
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Korman Commercial Properties has available offices and commercial space to own or rent in Philadelphia County,
            Bucks County, Neshaminy, Trevose, Feasterville, Blue Bell, Plymouth Meeting, Norristown, Bellmawr, Montgomery
            County and many other suburbs in the Philadelphia Region. Please feel free to contact us at any time.
          </p>
          <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4 text-slate-400 text-sm">
            <div><p>© {new Date().getFullYear()} Korman Commercial Properties, Inc. All rights reserved.</p></div>
            <div className="flex flex-col items-start">
              <p><Link className="hover:text-white transition-colors" href={sitePath("/privacy-policy")}>Privacy Policy</Link></p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
