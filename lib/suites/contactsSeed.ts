// Pre-populated suite-contact email directory. The storage layer falls
// back to this list whenever the suite-contacts manifest has no entry
// for a unit, so the unit page shows the on-record email as soon as
// you open it. Once the manifest has an entry (because someone edited
// the contact), that entry wins — the seed isn't merged in.
//
// Keyed by rent-roll unit ref ("BLDG-SUITE"). Each value is an ordered
// list of email addresses we have on file. Person names / titles are
// intentionally left blank: the spreadsheet tracks company addresses,
// not individual contacts. Staff fill those in over time.

export const SUITE_CONTACTS_SEED: Record<string, readonly string[]> = {
  // ── 3610 (JV III) ───────────────────────────────────────────────
  "3610-101": ["altruistichca@gmail.com"],
  "3610-103": ["ea@thealongroup.com"],
  "3610-104": ["invoices@myallamericancare.com"],
  "3610-105": ["theapricityapproach@gmail.com", "juliacmeehan@gmail.com"],
  "3610-106": ["patientfirsthca@gmail.com"],
  "3610-202": ["gina@mrnoah.com"],
  "3610-203": ["nozzi6105@gmail.com"],
  "3610-205": ["dayempervaiz97@gmail.com"],
  "3610-209": ["walter@west-comm.com"],
  "3610-300": ["keyiara@eelp.net"],
  "3610-302": ["pdimitrova@traffictech.com", "ap@traffictech.com"],
  "3610-305": ["elizabeth.reevey@hhinc.org"],
  "3610-310": ["accounting@amreslending.com"],

  // ── 3620 (JV III) ───────────────────────────────────────────────
  "3620-100": ["ap@vtinfo.com"],
  "3620-102": ["lende@comcast.net"],
  "3620-104": ["dtee@cpsgo.com"],
  "3620-108": ["jkoszarek@jdm-inc.com"],
  "3620-110": ["rentdepartment@davita.com"],
  "3620-205": ["rburgos@masoneast-pa.com", "sgelb@masoneast-pa.com"],
  "3620-209": ["john@freitagfamilyagency.com"],
  "3620-210": ["mlonergan@northmarqadv.com"],
  "3620-310": ["sbsap@avidbill.com", "apinquiries@sbsmiles.org"],
  "3620-312": ["paulab@advenser.net"],

  // ── 3640 (JV III) ───────────────────────────────────────────────
  "3640-101": ["hbalogun@mednetservices.com"],
  "3640-103": ["kfederico@falconengineering.com"],
  "3640-105": ["mary@edwardgilsonlaw.com"],
  "3640-106": ["jpio@teamsignal.com", "bkotowski@teamsignal.com"],
  "3640-107": ["verlette@envoylighting.com"],
  "3640-108": ["dennis@dennisrichman.com"],
  "3640-109": ["realestateleases@kleinfelder.com"],
  "3640-111": ["rhine@nalc.org"],
  "3640-204": ["psaap@avenna.com"],
  "3640-205": ["schmidtsl@aol.com"],
  "3640-206": ["vipul@carnegiehealthcare.com"],
  "3640-207": ["lcarr@uservices.com"],
  "3640-300": ["mark@seominteractive.com"],
  "3640-301": ["accounts.payable@srpcompanies.com"],

  // ── 4050 (NI LLC) ───────────────────────────────────────────────
  "4050-113": ["kwyatt@strangcorp.com"],
  "4050-115": ["susan@skhabstract.com"],
  "4050-201": ["accounts_payable@abc-med.com"],
  "4050-205": ["kormancommercial@avidbill.com"],
  "4050-206": ["lawclerk4@immigrationwise.com"],
  "4050-207": ["invoice@integralfed.com"],
  "4050-300": ["esmatt4@aol.com"],
  "4050-301": ["office@disastersolutionsinc.com"],
  "4050-307": ["larry@larrythelawyer.com"],
  "4050-315": ["accounting@fsdc-law.com"],

  // ── 4060 (NI LLC) ───────────────────────────────────────────────
  "4060-100": ["propertymanagement@hearusa.com"],
  "4060-105": ["ogorman@cornerstonecaregiving.com"],
  "4060-111": ["mdeangelis@CBIZ.com"],
  "4060-113": ["leases@metroveincenters.com"],
  "4060-204": ["mkahak@kahak.com"],
  "4060-205": ["andrew@lvlstechs.com"],
  "4060-206": ["sandra@sandramorrislaw.com"],
  "4060-207": ["fernanda@legaltrucking.com"],
  "4060-208": ["mlstax@hotmail.com"],
  "4060-210": ["ap@avakyancapital.com"],
  "4060-211": ["sstern@affinityhealthmanagement.com"],
  "4060-212": ["admin@helpinghandnurse.com"],
  "4060-215": ["margi@regionalcardiologists.com"],
  "4060-300": ["jdaley@jjwhiteinc.com"],
  "4060-401": ["kteklinsky@activeday.com"],
  "4060-402": ["leases@ssactivewear.com"],
  "4060-403": ["billing@modernroofingandexteriors.com"],
  "4060-500": ["emanraja.ffl@gmail.com", "salemronnie93@gmail.com"],

  // ── 4070 (NI LLC) ───────────────────────────────────────────────
  "4070-103": ["steve@bctma.com"],
  "4070-107": ["email@ossv.net"],
  "4070-113": ["bmcquoid@allstate.com"],
  "4070-115": ["khalikov577@gmail.com"],
  "4070-116": ["nicole@rothkofflaw.com"],
  "4070-117": ["payable@btsbm.com"],
  "4070-201": ["RobertHalfLeaseAdmin@jll.com"],
  "4070-209": ["ryanjanis44@gmail.com"],
  "4070-211": ["reynolds@aim-online.us"],
  "4070-215": ["arohricht@cgbaglaw.com"],
  "4070-301": ["AP@veltriinc.com"],
  "4070-400": ["mmayad@mette.com"],
  "4070-411": ["uhg.docs@cbre.com"],
  "4070-415": ["AP@veltriinc.com"],

  // ── 4080 (NI LLC) ───────────────────────────────────────────────
  "4080-100": ["ceveritt@lawlerdirect.com"],
  "4080-102": ["monicabarrett@comcast.net"],
  "4080-107": ["ceveritt@lawlerdirect.com"],
  "4080-109": ["cynthia.rickmond@prosegur.com"],
  "4080-111": ["cmarrero@mpmpc.com"],
  "4080-112": ["cosparks85@yahoo.com"],
  "4080-115": ["billing@wwlandtransfer.com"],
  "4080-117": ["billing@wwlandtransfer.com"],
  "4080-207": ["elayne.keehfuss@mackeeinc.com"],
  "4080-209": ["accounts.payable@dsainc.com"],
  "4080-210": ["amykarpf@karpf-law.com"],
  "4080-215": ["accounting@powerskirn.com"],
  "4080-217": ["rauf@sultantrans.com", "aziz.radjabov@sultantrans.com"],
  "4080-219": ["Gwiley@db-eng.com"],
  "4080-221": ["paoffice@cimplifi.com"],
  "4080-305": ["hfalguera@pfcsupports.org"],
  "4080-400": ["kormancommercial@avidbill.com"],
  "4080-401": ["andrea.Gbemudu@apitech.com"],

  // ── Kor Center A / B / C ─────────────────────────────────────────
  "40A0-A":   ["lcashman@pennemblem.com"],
  // Adelina Express occupies both suites 201 and 205 — seed both.
  "40A0-201": ["adelina.expressllc@gmail.com"],
  "40A0-205": ["adelina.expressllc@gmail.com"],
  "40B0-1":   ["jebersh@yahoo.com"],
  "40B0-3":   ["bhaluska@mercerbuckstech.com"],
  "40B0-4":   ["bryan@usconnectcorporation.com"],
};
