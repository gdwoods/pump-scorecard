"use client";

import { FileText, AlertTriangle, TrendingDown, Calendar, Link2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface FilingType {
  formType: string;
  title: string;
  description: string;
  implications: string[];
  riskLevel: "high" | "medium" | "low";
  timeline: string;
  examples: string;
}

const filingTypes: FilingType[] = [
  {
    formType: "S-1",
    title: "Initial Registration Statement",
    description: "A comprehensive registration statement required before a company can offer new securities to the public. This is the starting point for many capital raises.",
    implications: [
      "Company is actively seeking to raise capital by selling new shares",
      "Indicates immediate or near-term dilution potential",
      "Must be declared 'effective' by the SEC before shares can be sold",
      "Often followed by 424B4 or EFFECT filings",
      "Companies typically have 90-180 days to complete the offering after effectiveness"
    ],
    riskLevel: "high",
    timeline: "Typically 2-4 weeks from filing to effectiveness, then offering can occur",
    examples: "IPO, direct offering, follow-on offering, at-the-market (ATM) offering"
  },
  {
    formType: "S-1/A",
    title: "Amendment to S-1",
    description: "An amended registration statement that updates or revises information in a previously filed S-1. Often contains pricing terms or offering size changes.",
    implications: [
      "May increase or decrease the size of the offering",
      "Can update pricing terms (often downward)",
      "May add or remove dilution mechanisms (warrants, convertibles)",
      "Indicates the offering is still active and being adjusted",
      "Watch for changes in offering amount - increases = more dilution"
    ],
    riskLevel: "high",
    timeline: "Filed throughout the S-1 process, can indicate active negotiations",
    examples: "Price adjustment, offering size increase, addition of warrants or overallotment"
  },
  {
    formType: "S-3",
    title: "Shelf Registration Statement",
    description: "A 'shelf' registration that allows seasoned issuers (companies with established public market presence) to sell securities 'off the shelf' over time without filing a new registration for each sale.",
    implications: [
      "Company has pre-approved authorization to dilute at any time",
      "More flexible than S-1 - can sell immediately when market conditions are favorable",
      "Allows 'opportunistic' capital raising",
      "Common for companies with frequent capital needs",
      "Often used with 'at-the-market' (ATM) programs"
    ],
    riskLevel: "high",
    timeline: "Effective immediately upon SEC approval, shares can be sold at any time",
    examples: "Shelf offering, ATM program, continuous equity program"
  },
  {
    formType: "S-3/A",
    title: "Amendment to S-3",
    description: "An amendment to an existing S-3 shelf registration, typically updating the amount registered or terms.",
    implications: [
      "May increase the amount of shares registered on the shelf",
      "Can modify offering terms or add new securities",
      "Indicates company is actively managing its capital raising capacity",
      "Check if offering amount is being increased"
    ],
    riskLevel: "high",
    timeline: "Filed as needed to update shelf capacity or terms",
    examples: "Shelf size increase, addition of new security types"
  },
  {
    formType: "424B4",
    title: "Prospectus Supplement (Rule 424(b)(4))",
    description: "A prospectus supplement that provides specific pricing and offering details. This is where you'll find the actual dilution numbers - share count, price, and total offering amount.",
    implications: [
      "Contains the actual pricing and dilution details",
      "Shows exact number of shares being offered",
      "Displays offering price per share",
      "May reveal warrant coverage or other dilution mechanisms",
      "Often filed shortly before or after shares are sold",
      "This is where you calculate exact dilution impact"
    ],
    riskLevel: "high",
    timeline: "Filed when specific offering is priced, often same day as sale",
    examples: "Priced offering details, final share count, warrant terms"
  },
  {
    formType: "424B5",
    title: "Prospectus Supplement (Rule 424(b)(5))",
    description: "Similar to 424B4, this supplement provides pricing and offering details, often used for shelf offerings or at-the-market (ATM) programs.",
    implications: [
      "Similar implications to 424B4",
      "May indicate active ATM selling is occurring",
      "Shows actual dilution happening in real-time",
      "ATM programs can create continuous selling pressure",
      "Monitor frequency - multiple 424B5s = active selling"
    ],
    riskLevel: "high",
    timeline: "Filed during active offering period, can be filed frequently for ATM programs",
    examples: "ATM program sales, shelf offering sales, continuous equity offerings"
  },
  {
    formType: "8-K",
    title: "Current Report",
    description: "A 'current report' filed to announce significant corporate events that shareholders should know about immediately. Can include financing arrangements, management changes, or material agreements.",
    implications: [
      "Can announce new financing agreements (convertible notes, equity lines)",
      "May disclose management resignations (red flag)",
      "Can reveal material contracts or debt arrangements",
      "Watch for Item 1.01 (Material Agreements) - often contains financing deals",
      "Item 8.01 (Other Events) may announce offerings",
      "Less structured than S-1/S-3, but can signal upcoming dilution"
    ],
    riskLevel: "medium",
    timeline: "Filed within 4 business days of event occurrence",
    examples: "Financing agreement, management resignation, convertible note issuance, ATM program announcement"
  },
  {
    formType: "8-K/A",
    title: "Amendment to 8-K",
    description: "An amendment to a previously filed 8-K, often providing additional details or corrections.",
    implications: [
      "May provide more details about financing arrangements",
      "Could correct or expand on dilution-related disclosures",
      "Indicates event is still being finalized or disclosed"
    ],
    riskLevel: "medium",
    timeline: "Filed after the original 8-K, typically within days or weeks",
    examples: "Additional financing terms, corrected share counts, expanded disclosures"
  },
  {
    formType: "EFFECT",
    title: "Notice of Effectiveness",
    description: "A critical filing that indicates an S-1 or S-3 registration statement has been declared 'effective' by the SEC. This is the green light for the company to sell shares.",
    implications: [
      "Company can now legally sell the registered securities",
      "Dilution can begin immediately",
      "This is the trigger point - before EFFECT, shares cannot be sold",
      "Often followed quickly by 424B4 or 424B5 when shares are actually sold",
      "Monitor closely - effectiveness means offering is live",
      "High-risk period begins once EFFECT is filed"
    ],
    riskLevel: "high",
    timeline: "Filed when SEC declares registration effective, typically 2-4 weeks after S-1/S-3 filing",
    examples: "S-1 effectiveness, S-3 shelf effectiveness"
  },
  {
    formType: "10-K",
    title: "Annual Report",
    description: "Comprehensive annual report with audited financial statements. While less directly related to dilution, it can contain important context about company financials and capital needs.",
    implications: [
      "May reveal financial distress that could lead to dilution",
      "Contains management discussion that may hint at capital raising plans",
      "Shows historical dilution if outstanding shares have increased",
      "Less immediate than S-1/S-3 but provides important context"
    ],
    riskLevel: "low",
    timeline: "Filed annually, within 60-90 days of fiscal year end",
    examples: "Annual financial reporting, comprehensive company overview"
  },
  {
    formType: "10-Q",
    title: "Quarterly Report",
    description: "Quarterly report with unaudited financial statements. Like 10-K, provides context but is less directly related to active dilution events.",
    implications: [
      "May show quarterly dilution through increased outstanding shares",
      "Can reveal deteriorating financial condition",
      "Provides context for why company might need capital",
      "Less actionable than S-1/S-3 filings"
    ],
    riskLevel: "low",
    timeline: "Filed quarterly, within 40-45 days of quarter end",
    examples: "Quarterly financial reporting, interim financial statements"
  }
];

function getRiskColor(riskLevel: string) {
  switch (riskLevel) {
    case "high":
      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700";
    case "medium":
      return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700";
    case "low":
      return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700";
    default:
      return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600";
  }
}

export default function EducationPage() {
  return (
    <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              title="Back to alerts"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                SEC Filings Education
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Understanding SEC filings and their implications for dilution risk
              </p>
            </div>
          </div>
        </div>

        {/* Introduction */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-3 mb-4">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Why Understanding SEC Filings Matters
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-3">
                SEC filings are the legal documents companies must file when raising capital through equity offerings. 
                For short sellers and dilution watchers, these filings reveal when, how, and how much a company plans to dilute shareholders.
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                This guide explains the most important filing types we track and what they mean for dilution risk. 
                Understanding the filing timeline and implications helps you anticipate when dilution will occur.
              </p>
            </div>
          </div>
        </div>

        {/* Filing Types */}
        <div className="space-y-6">
          {filingTypes.map((filing) => (
            <div
              key={filing.formType}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {filing.formType}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRiskColor(filing.riskLevel)}`}>
                        {filing.riskLevel.toUpperCase()} RISK
                      </span>
                    </div>
                    <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
                      {filing.title}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-gray-700 dark:text-gray-300 mb-4">
                {filing.description}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Timeline</h4>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{filing.timeline}</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Common Examples</h4>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{filing.examples}</p>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  <h4 className="font-semibold text-yellow-900 dark:text-yellow-300">Key Implications for Dilution Risk</h4>
                </div>
                <ul className="space-y-2">
                  {filing.implications.map((implication, idx) => (
                    <li key={idx} className="text-sm text-yellow-800 dark:text-yellow-200 flex items-start gap-2">
                      <span className="text-yellow-600 dark:text-yellow-400 mt-1">•</span>
                      <span>{implication}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Filing Timeline Diagram */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Typical Dilution Filing Timeline
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <span className="font-bold text-red-700 dark:text-red-400">1.</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">S-1 or S-3 Filed</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Company registers shares but cannot sell yet</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <span className="font-bold text-orange-700 dark:text-orange-400">2.</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">EFFECT Filed</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">SEC declares registration effective - shares can now be sold</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <span className="font-bold text-red-700 dark:text-red-400">3.</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">424B4 or 424B5 Filed</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Actual sale occurs - dilution happens here</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Note:</strong> S-1/A amendments can be filed at any point to adjust terms. 
                8-K filings may announce financing arrangements before formal registration. 
                Monitor all filings in sequence to understand the complete dilution picture.
              </p>
            </div>
          </div>
        </div>

        {/* Best Practices */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-300 mb-4">
            💡 Best Practices for Monitoring Dilution
          </h2>
          <ul className="space-y-2 text-blue-800 dark:text-blue-200">
            <li className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <span><strong>Track the sequence:</strong> S-1 → EFFECT → 424B4 = active dilution happening</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <span><strong>Watch for amendments:</strong> S-1/A or S-3/A may increase offering size</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <span><strong>Monitor 8-K filings:</strong> May announce financing before formal registration</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <span><strong>EFFECT is critical:</strong> No dilution can occur before effectiveness, but it's imminent after</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <span><strong>Multiple 424B5s:</strong> Indicates active ATM selling - continuous dilution pressure</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <span><strong>Check offering amounts:</strong> 424B4/424B5 show actual dilution - calculate % of float</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="text-center py-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Alerts
          </Link>
        </div>
      </div>
    </div>
  );
}
