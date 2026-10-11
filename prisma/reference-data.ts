import type { LocationType } from "@prisma/client";

export const CATEGORIES: { slug: string; nameEn: string; nameMy: string; icon: string }[] = [
  { slug: "hackathons", nameEn: "Hackathons", nameMy: "ဟက်ကာသွန်များ", icon: "trophy" },
  { slug: "programming-competitions", nameEn: "Programming Competitions", nameMy: "ပရိုဂရမ်ရေးပြိုင်ပွဲများ", icon: "code" },
  { slug: "artificial-intelligence", nameEn: "Artificial Intelligence", nameMy: "ဉာဏ်ရည်တု (AI)", icon: "brain" },
  { slug: "machine-learning", nameEn: "Machine Learning", nameMy: "စက်သင်ယူမှု (ML)", icon: "cpu" },
  { slug: "data-science", nameEn: "Data Science", nameMy: "ဒေတာသိပ္ပံ", icon: "database" },
  { slug: "cybersecurity", nameEn: "Cybersecurity", nameMy: "ဆိုက်ဘာလုံခြုံရေး", icon: "shield" },
  { slug: "ctf", nameEn: "Capture The Flag (CTF)", nameMy: "CTF ပြိုင်ပွဲများ", icon: "flag" },
  { slug: "web-development", nameEn: "Web Development", nameMy: "ဝဘ်ဖွံ့ဖြိုးရေး", icon: "globe" },
  { slug: "mobile-development", nameEn: "Mobile Development", nameMy: "မိုဘိုင်းအက်ပ်ဖွံ့ဖြိုးရေး", icon: "smartphone" },
  { slug: "ui-ux-design", nameEn: "UI/UX Design", nameMy: "UI/UX ဒီဇိုင်း", icon: "palette" },
  { slug: "game-development", nameEn: "Game Development", nameMy: "ဂိမ်းဖွံ့ဖြိုးရေး", icon: "gamepad-2" },
  { slug: "robotics", nameEn: "Robotics", nameMy: "စက်ရုပ်နည်းပညာ", icon: "bot" },
  { slug: "cloud-computing", nameEn: "Cloud Computing", nameMy: "ကလောက်ကွန်ပျူတင်း", icon: "cloud" },
  { slug: "devops", nameEn: "DevOps", nameMy: "DevOps", icon: "server" },
  { slug: "blockchain", nameEn: "Blockchain", nameMy: "ဘလောက်ချိန်း", icon: "blocks" },
  { slug: "startup-competitions", nameEn: "Startup Competitions", nameMy: "စတားတပ်ပြိုင်ပွဲများ", icon: "rocket" },
  { slug: "entrepreneurship", nameEn: "Entrepreneurship", nameMy: "စီးပွားရေးလုပ်ငန်းရှင်ဖြစ်မှု", icon: "lightbulb" },
  { slug: "technology-workshops", nameEn: "Technology Workshops", nameMy: "နည်းပညာအလုပ်ရုံဆွေးနွေးပွဲများ", icon: "wrench" },
  { slug: "bootcamps", nameEn: "Bootcamps", nameMy: "ဘွတ်ကမ့်များ", icon: "graduation-cap" },
  { slug: "conferences", nameEn: "Conferences", nameMy: "ညီလာခံများ", icon: "mic" },
  { slug: "developer-meetups", nameEn: "Developer Meetups", nameMy: "ဒက်ဗယ်လော်ပါ တွေ့ဆုံပွဲများ", icon: "users" },
  { slug: "university-events", nameEn: "University Events", nameMy: "တက္ကသိုလ်ပွဲများ", icon: "school" },
];

export const LOCATIONS: { slug: string; nameEn: string; nameMy: string; type: LocationType }[] = [
  { slug: "yangon", nameEn: "Yangon Region", nameMy: "ရန်ကုန်တိုင်းဒေသကြီး", type: "REGION" },
  { slug: "mandalay", nameEn: "Mandalay Region", nameMy: "မန္တလေးတိုင်းဒေသကြီး", type: "REGION" },
  { slug: "sagaing", nameEn: "Sagaing Region", nameMy: "စစ်ကိုင်းတိုင်းဒေသကြီး", type: "REGION" },
  { slug: "bago", nameEn: "Bago Region", nameMy: "ပဲခူးတိုင်းဒေသကြီး", type: "REGION" },
  { slug: "magway", nameEn: "Magway Region", nameMy: "မကွေးတိုင်းဒေသကြီး", type: "REGION" },
  { slug: "ayeyarwady", nameEn: "Ayeyarwady Region", nameMy: "ဧရာဝတီတိုင်းဒေသကြီး", type: "REGION" },
  { slug: "tanintharyi", nameEn: "Tanintharyi Region", nameMy: "တနင်္သာရီတိုင်းဒေသကြီး", type: "REGION" },
  { slug: "kachin", nameEn: "Kachin State", nameMy: "ကချင်ပြည်နယ်", type: "STATE" },
  { slug: "kayah", nameEn: "Kayah State", nameMy: "ကယားပြည်နယ်", type: "STATE" },
  { slug: "kayin", nameEn: "Kayin State", nameMy: "ကရင်ပြည်နယ်", type: "STATE" },
  { slug: "chin", nameEn: "Chin State", nameMy: "ချင်းပြည်နယ်", type: "STATE" },
  { slug: "mon", nameEn: "Mon State", nameMy: "မွန်ပြည်နယ်", type: "STATE" },
  { slug: "rakhine", nameEn: "Rakhine State", nameMy: "ရခိုင်ပြည်နယ်", type: "STATE" },
  { slug: "shan", nameEn: "Shan State", nameMy: "ရှမ်းပြည်နယ်", type: "STATE" },
  { slug: "naypyidaw", nameEn: "Naypyidaw Union Territory", nameMy: "နေပြည်တော်ပြည်ထောင်စုနယ်မြေ", type: "UNION_TERRITORY" },
  { slug: "online", nameEn: "Online", nameMy: "အွန်လိုင်း", type: "ONLINE" },
  { slug: "nationwide", nameEn: "Nationwide", nameMy: "တစ်နိုင်ငံလုံး", type: "NATIONWIDE" },
  { slug: "international", nameEn: "International", nameMy: "နိုင်ငံတကာ", type: "INTERNATIONAL" },
];

/** TOTP secret for the local DEMO staff accounts only (never created in production). Shared by the seed and the e2e tests. */
export const DEMO_MFA_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
