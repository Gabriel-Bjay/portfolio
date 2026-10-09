// Single place for personal details shown across the site.
export const site = {
  name: "Joseph M",
  role: "Full-stack developer",
  location: "Nairobi, Kenya",
  fiverrUrl: "https://www.fiverr.com/bjay_makara",
  githubUrl: "https://github.com/Gabriel-Bjay",
  repoUrl: "https://github.com/Gabriel-Bjay/portfolio",
} as const;

export const projects = [
  {
    href: "/dashboard",
    name: "Mauzo Insights",
    tagline: "Drop in a sales spreadsheet, get a dashboard, forecast and plain-English insights.",
    tags: ["Data analysis", "Forecasting", "React", "Recharts"],
  },
  {
    href: "/chatbot",
    name: "Jibu",
    tagline: "An AI support assistant that answers from a business's own FAQ, in English or Swahili.",
    tags: ["AI / RAG", "Gemini", "Streaming", "Embeddable widget"],
  },
] as const;
