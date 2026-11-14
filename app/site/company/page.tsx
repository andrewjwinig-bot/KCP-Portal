import type { Metadata } from "next";
import { siteAsset } from "@/lib/site/paths";
import CompanyCollage from "./CompanyCollage";

export const metadata: Metadata = { title: "Company" };

// The Company page: the photo collage, the KOR values, then the company's
// story in four chapters alternating photo left / photo right.

const VALUES = [
  { letter: "K", title: "Knowledge", text: "Our century of market expertise informs every property acquisition, development, and management decision. We understand the complexities of commercial real estate markets and leverage this knowledge to maximize value." },
  { letter: "O", title: "Original Thinking", text: "We bring innovative solutions to commercial property challenges, from adaptive reuse of historic buildings to implementing cutting-edge sustainability features that reduce operating costs and environmental impact." },
  { letter: "R", title: "Relationships", text: "Real estate is a relationship business. We prioritize trust, transparency, and long-term partnerships—with tenants, investors, and communities—because we believe that strong relationships are the foundation of success." },
];

// A paragraph is a string; a run of bullets is a string[].
type Chapter = {
  era: string;
  title: React.ReactNode;
  body: (string | string[])[];
  image: string;
  alt: string;
  imageFirst: boolean;
  imageClass?: string;
  height: string;
  bg: string;
};

const STORY: Chapter[] = [
  {
    era: "1919 - 1950s",
    title: "Founding and Early Growth",
    image: "images/categories_duplicate/hyman-korman-inc-truck-bw.jpg",
    alt: "Korman Commercial Properties Early Years",
    imageClass: "object-left",
    imageFirst: true,
    height: "h-[450px] sm:h-[500px] md:h-[600px]",
    bg: "bg-white",
    body: [
      "Korman Commercial Properties traces its roots to 1919, when founder Hyman Korman began building homes in Philadelphia. In the early decades, the company helped shape Northeast Philadelphia, most notably through the development of Castor Avenue—transforming it into a thriving residential and commercial corridor. Korman constructed hundreds of brick rowhomes and twins in surrounding neighborhoods, many of which remain highly livable a century later. These early projects established Korman’s reputation for craftsmanship and community-minded planning.",
      "As the city grew, so did the company’s ambitions. In the postwar housing boom, Korman delivered one of Philadelphia’s earliest and largest master-planned communities: Parkwood Manor. Built in Northeast Philadelphia, this project included thousands of single-family homes, offering returning veterans and young families an affordable, walkable, and well-connected neighborhood—setting a precedent for suburban-style development within city limits.",
    ],
  },
  {
    era: "1950s - 1990s",
    title: "Transformative Growth: From Homes to Hubs",
    image: "images/categories_duplicate/Neshaminy-Mall-Totem.jpg",
    alt: "Korman Commercial Properties Middle Years",
    imageFirst: false,
    height: "h-[600px] sm:h-[700px] md:h-[900px]",
    bg: "bg-slate-50",
    body: [
      "Under the leadership of the second and third generations of the Korman family, the second half of the 20th century marked a period of transformative growth and strategic diversification. The company expanded its portfolio to include office complexes, retail centers, industrial parks, and large-scale mixed-use developments, reshaping the suburban and urban landscapes of Greater Philadelphia.",
      "One of the most significant undertakings during this era was the creation of the Neshaminy Interplex in Bucks County. Developed in phases beginning in the 1970s, this Class A office park grew to over 1 million square feet, making it the largest and most prominent office campus in the county. With amenities like a Radisson Hotel, retail services, and direct highway access, the Interplex became a magnet for major tenants and a model for suburban business environments.",
      "On the retail front, Korman co-developed the Neshaminy Mall, which opened in 1968 as one of the first six enclosed malls in the Philadelphia region, spanning more than 1 million square feet. It served as a dominant shopping destination for decades. Complementing this was the acquisition and repositioning of the Bucks County Mall in Feasterville. Once struggling, Korman redeveloped it into the 131,000-square-foot Bucks Crossing—anchored by TJ Maxx, Acme, and national chains—revitalizing a key neighborhood retail asset and later selling it successfully in 2013.",
      "To the south, the company launched the Concord Interplex, a 250-acre mixed-use development in Delaware County. It featured the 538,000-square-foot Concordville Town Centre, the 1,800-unit Maris Grove senior living community, and a major healthcare campus. Together, these projects generated over 1,000 jobs and transformed raw land into a regional center of commerce, healthcare, and housing—an early example of mixed-use suburban planning at scale.",
      "In parallel with its office and retail developments, Korman recognized the rising importance of logistics and industrial infrastructure. During the 1970s and 1980s, the company developed the Interstate Industrial Park in Bellmawr, New Jersey—a 2 million-square-foot, master-planned warehouse and distribution campus. Strategically located near the intersection of the New Jersey Turnpike, I-295, and Route 42, the park offered unmatched connectivity for freight and logistics users.",
    ],
  },
  {
    era: "",
    title: <>Airport Interplex &amp; Eastwick:<br />A Vision at City Scale</>,
    image: "images/properties/eight-neshaminy/eight_neshaminy_1.jpg",
    alt: "Korman Commercial Properties Modern Era",
    imageFirst: true,
    height: "h-[450px] sm:h-[500px] md:h-[600px]",
    bg: "bg-white",
    body: [
      "Korman's most ambitious and transformative initiative unfolded in Southwest Philadelphia, through its multi-decade involvement in the redevelopment of Eastwick—launched as the largest urban renewal project in the United States in 1957. Partnering with Alcoa's New Eastwick Corporation, Korman helped execute a plan that would ultimately deliver:",
      [
        "More than 3,000 single-family homes and 1,100 apartments",
        "Two modern retail centers with 38 national stores, including the enduring Penrose Plaza",
        "And most notably, the full realization of the Airport Interplex.",
      ],
      "Situated on 88 acres directly adjacent to Philadelphia International Airport, the Airport Interplex was envisioned as a comprehensive business and hospitality complex. It included seven nationally branded hotels, extended-stay lodging, restaurants, meeting venues, and shuttle infrastructure—effectively becoming a singular commercial hub dedicated to airport travelers, airline crews, and business guests.",
      "This “airport city” concept, rare for its time, positioned the Interplex as a vital extension of the airport. It supports hundreds of hospitality jobs, accommodates thousands of travelers annually, and enhances Philadelphia’s competitiveness as a convention and business travel destination.",
    ],
  },
  {
    era: "",
    title: "Legacy of Excellence and Enduring Relationships",
    image: "images/properties/The-Office-Works/The-office-works-1.jpg",
    alt: "Korman Commercial Properties Modern Era",
    imageFirst: false,
    height: "h-[450px] sm:h-[500px] md:h-[600px]",
    bg: "bg-slate-50",
    body: [
      "By the end of the 20th century, Korman Commercial Properties had developed millions of square feet of commercial real estate, thousands of homes, and earned a reputation for excellence in property management, tenant relations, and community stewardship.",
      "Now led by the fourth and fifth generations of the Korman family, the company continues to build on this legacy with a forward-looking approach rooted in its founding values. Remaining privately held and family-managed, Korman Commercial Properties blends multigenerational perspective with modern strategy—reinvesting in core assets, pursuing selective new development, and adapting to the evolving needs of tenants and communities.",
      "As the landscape of commercial real estate continues to shift, Korman remains committed to thoughtful growth, operational excellence, and long-term stewardship across office, industrial, retail, and mixed-use sectors.",
    ],
  },
];

const FILL: React.CSSProperties = { position: "absolute", height: "100%", width: "100%", left: 0, top: 0, right: 0, bottom: 0 };

function ChapterSection({ c }: { c: Chapter }) {
  const photo = (
    <div className={`self-center relative rounded-lg overflow-hidden shadow-xl ${c.imageFirst ? "order-2 md:order-1" : "order-2 md:order-2"} ${c.height}`}>
      <img alt={c.alt} loading="lazy" src={siteAsset(c.image)} className={`object-cover ${c.imageClass ?? ""}`} style={FILL} />
    </div>
  );
  const text = (
    <div className={c.imageFirst ? "order-1 md:order-2" : "order-1 md:order-1"}>
      <div className="mb-6">
        <span className="text-sm tracking-wider text-slate-500 font-semibold">{c.era}</span>
        <div className="bg-slate-800 h-0.5 w-16 my-3 md:my-4" />
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-light text-slate-900 mb-5 md:mb-6">{c.title}</h2>
      </div>
      <div className="text-base md:text-lg text-slate-700 leading-relaxed">
        {c.body.map((b, i) =>
          Array.isArray(b) ? (
            b.map((li, j) => (
              <p key={`${i}-${j}`} className={j === 0 ? "mt-4 md:mt-5 pt-0 pb-0.5" : "mt-0 pt-0 pb-0.5"}>• {li}</p>
            ))
          ) : (
            <p key={i} className="mt-4 md:mt-5">{b}</p>
          ),
        )}
      </div>
    </div>
  );
  return (
    <section className={`pt-8 pb-20 md:pb-24 ${c.bg}`}>
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-start">
            {c.imageFirst ? <>{photo}{text}</> : <>{text}{photo}</>}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CompanyPage() {
  return (
    <main className="min-h-screen">
      <CompanyCollage />
      <section className="pb-12 pt-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="mb-12">
              <div className="w-24 h-1 bg-slate-800 mb-8 mx-auto" />
              <h2 className="text-4xl md:text-5xl font-light text-slate-800 mb-4 text-center">Our KOR Values</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
              {VALUES.map((v) => (
                <div className="flex flex-col items-center" key={v.letter}>
                  <div className="text-[120px] font-bold text-slate-700 leading-none mb-4 text-center">{v.letter}</div>
                  <h3 className="text-2xl font-semibold text-slate-800 mb-4 text-center">{v.title}</h3>
                  <p className="text-slate-600 text-center">{v.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="bg-white">
        <div className="container mx-auto px-4 pt-12 pb-0">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <div className="w-24 h-1 bg-slate-800 mb-8" />
              <h2 className="text-4xl md:text-5xl font-light text-slate-800 mb-4">Our Story</h2>
            </div>
          </div>
        </div>
        {STORY.map((c, i) => <ChapterSection key={i} c={c} />)}
      </section>
    </main>
  );
}
