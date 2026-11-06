// Building facts as the insurance broker's Statement of Values carried them
// (LIK Management "Property Statement of Values", received 9/2026) — the
// starting point for every property's Building Facts, so the page opens filled
// in rather than blank.
//
// Laid UNDER what anyone keys (`getFacts` in facts.ts): an edit on the property
// page always wins, and clearing a field there clears it. A property the form
// spreads over several rows (Trust #4, Butler & Main) carries only the answers
// its rows agree on. Floor area and units are not here — they come from the
// rent roll. Next year's form is filled FROM these facts (/insurance), so once
// a figure is corrected on the property page it goes back to the broker
// corrected.

export const FACTS_SEED: Record<string, Record<string, string | number>> = {
  "0800": { constructionType: "Fire Resistive", occupancyDescription: "Industrial" },
  "1100": { constructionType: "Masonry", occupancyDescription: "Office", yearBuilt: 1970, stories: "1", buildingCount: "1", sprinklered: "No", basement: "Y", floodZone: "No", protection: "Unarmed Security Guard" },
  "1500": { constructionType: "Masonry", occupancyDescription: "Mercantile", stories: "1", sprinklered: "No", pctSprinklered: "0%", floodZone: "No" },
  "2300": { constructionType: "Masonry", occupancyDescription: "Mercantile", yearBuilt: 1966, stories: "1", buildingCount: "4", sprinklered: "Central Station Alarm - Partial / Balance non-sprinklered", pctSprinklered: "63%", parkingSqft: "180,000", basement: "N", floodZone: "No" },
  "3610": { constructionType: "Fire Resistive", occupancyDescription: "Office", yearBuilt: 1977, stories: "3", buildingCount: "1", sprinklered: "non sprinklered - Central Station Alarm", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "3620": { constructionType: "Fire Resistive", occupancyDescription: "Office", yearBuilt: 1979, stories: "3", buildingCount: "1", sprinklered: "non sprinklered - Central Station Alarm", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "3640": { constructionType: "Fire Resistive", occupancyDescription: "Office", yearBuilt: 1981, stories: "3", buildingCount: "1", sprinklered: "non sprinklered - Central Station Alarm", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "4050": { constructionType: "Fire Resistive", occupancyDescription: "Office", yearBuilt: 1984, stories: "3", buildingCount: "1", sprinklered: "non sprinklered - Central Station Alarm", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "4060": { constructionType: "Fire Resistive", occupancyDescription: "Office", yearBuilt: 1986, stories: "6", buildingCount: "1", sprinklered: "Sprinklered & Central Station Alarm - 100%", pctSprinklered: "100%", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "4070": { constructionType: "Fire Resistive", occupancyDescription: "Office", yearBuilt: 1987, stories: "4", buildingCount: "1", sprinklered: "Sprinklered & Central Station Alarm", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "4080": { constructionType: "Fire Resistive", occupancyDescription: "Office", yearBuilt: 1988, stories: "4", buildingCount: "1", sprinklered: "Sprinklered & Central Station Alarm", parkingSqft: "57,912", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "40A0": { constructionType: "Fire Resistive", occupancyDescription: "Office/Flex", yearBuilt: 1978, stories: "2", buildingCount: "1", sprinklered: "non sprinklered - Central Station Alarm", floodZone: "No", protection: "Unarmed Security Guard" },
  "40B0": { constructionType: "Fire Resistive", occupancyDescription: "Office/Flex", yearBuilt: 1978, stories: "1", buildingCount: "1", sprinklered: "non sprinklered - Local Fire Alarm", floodZone: "No", protection: "Unarmed Security Guard" },
  "40C0": { constructionType: "Fire Resistive", occupancyDescription: "Office/Flex", yearBuilt: 1978, stories: "1", buildingCount: "1", sprinklered: "Sprinklered & Central Station Alarm - 100%", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "4500": { constructionType: "Masonry", occupancyDescription: "Mercantile", yearBuilt: 1989, stories: "1", sprinklered: "Yes - Central Station Alarm", pctSprinklered: "100%", parkingSqft: "329,700", basement: "N", floodZone: "No", protection: "Unarmed Security Guard" },
  "4900": { constructionType: "Fire Resistive", occupancyDescription: "Office", sprinklered: "non sprinklered - Central Station Alarm", floodZone: "No", protection: "Unarmed Security Guard and Card Keys" },
  "5600": { constructionType: "Masonry", occupancyDescription: "Mercantile", yearBuilt: 1951, stories: "1", buildingCount: "1", sprinklered: "No", basement: "Y", floodZone: "No" },
  "7010": { constructionType: "Masonry", occupancyDescription: "Mercantile", yearBuilt: 1963, stories: "2", buildingCount: "7", sprinklered: "Central Station Monitored fire alarm for Office Center Only", parkingSqft: "190,000", basement: "Partial", floodZone: "No", protection: "Unarmed Security Guard" },
  "7200": { constructionType: "Fire Resistive", occupancyDescription: "Mercantile", yearBuilt: 1969, stories: "1", buildingCount: "1", sprinklered: "Yes - Central Station Alarm", pctSprinklered: "100%", parkingSqft: "16,080", basement: "N", floodZone: "No" },
  "7300": { constructionType: "Masonry", occupancyDescription: "Mercantile", yearBuilt: 1958, stories: "1", sprinklered: "No", parkingSqft: "63,905", floodZone: "No" },
  "8200": { constructionType: "Masonry", occupancyDescription: "Mercantile", stories: "1", buildingCount: "2" },
  "9000": { constructionType: "Joisted Masonry", buildingCount: "3", sprinklered: "No" },
  "9510": { constructionType: "Joisted Masonry", occupancyDescription: "Mercantile", yearBuilt: 1976, buildingCount: "2", sprinklered: "No", basement: "Yes", floodZone: "No", protection: "Protection class 03" },
};
