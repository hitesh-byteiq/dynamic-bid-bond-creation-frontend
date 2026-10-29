export type BondFieldValue = string | boolean;
export type BondValues = Record<string, BondFieldValue>;
export type BondFieldKind = "text" | "multiline" | "currency" | "date" | "checkbox" | "select";
export type BondPageNumber = 1 | 2 | 3;

export type BondField = {
  id: string;
  label: string;
  kind: BondFieldKind;
  page: BondPageNumber;
  required: boolean;
  value: BondFieldValue;
  source: string;
  confidence: string;
  status: "verified" | "review";
  readOnly: boolean;
  options?: string[];
  maxLines?: number;
};

export type BondSection = {
  heading: string;
  body?: string;
  fields?: string[];
  columns?: 1 | 2;
  signatures?: string[];
};

export type BondPage = {
  subtitle: string;
  intro: string;
  sections: BondSection[];
};

export type BondTemplate = {
  id: string;
  name: string;
  issuer: string;
  formTitle: string;
  documentCode: string;
  filename: string;
  kind: "bid" | "performance";
  style: "city" | "state" | "school" | "district";
  pageSize: "LETTER" | "A4";
  sourceText: string;
  fields: BondField[];
  pages: [BondPage, BondPage, BondPage];
  bidPercent?: 10;
};

type FieldOptions = {
  kind?: BondFieldKind;
  required?: boolean;
  source?: string;
  confidence?: string;
  status?: BondField["status"];
  readOnly?: boolean;
  options?: string[];
  maxLines?: number;
};

function field(
  id: string,
  label: string,
  value: BondFieldValue,
  page: BondPageNumber,
  options: FieldOptions = {},
): BondField {
  return {
    id,
    label,
    value,
    page,
    kind: options.kind ?? "text",
    required: options.required ?? true,
    source: options.source ?? "Business information",
    confidence: options.confidence ?? (value === "" ? "0%" : "96%"),
    status: options.status ?? "verified",
    readOnly: options.readOnly ?? false,
    ...(options.options ? { options: options.options } : {}),
    ...(options.maxLines ? { maxLines: options.maxLines } : {}),
  };
}

function demoField(
  id: string,
  label: string,
  value: BondFieldValue,
  page: BondPageNumber,
  options: FieldOptions = {},
): BondField {
  return field(id, label, value, page, { ...options, source: "Supplemental demo details" });
}

const baseBondTemplates: BondTemplate[] = [
  {
    id: "montebello-proposal-guarantee",
    name: "City of Montebello: Proposal Guarantee (Bid Bond)",
    issuer: "City of Montebello",
    formTitle: "PROPOSAL GUARANTEE · BID BOND",
    documentCode: "C-17",
    filename: "City-of-Montebello-Proposal-Guarantee-Bid-Bond.pdf",
    kind: "bid",
    style: "city",
    pageSize: "LETTER",
    bidPercent: 10,
    sourceText:
      "City of Montebello proposal guarantee for LED Sign City Hall, C.P. No. 933. Bidder: Westline Electric LLC, 410 South Maple Avenue, Los Angeles, CA 90013. Surety: Pacific Guarantee Surety Company. Bid amount: $185,000. Bond security: ten percent of the bid ($18,500). Bid opening: November 12, 2026. Bond date: November 10, 2026. Principal representative: Jordan Diaz. Surety attorney-in-fact: Morgan Lee. Bidder representative title has not been provided.",
    fields: [
      field("project", "Project name", "LED Sign City Hall", 1),
      field("projectNumber", "C.P. number", "933", 1),
      field("principal", "Bidder", "Westline Electric LLC", 1),
      field(
        "principalAddress",
        "Bidder address",
        "410 South Maple Avenue, Los Angeles, CA 90013",
        1,
      ),
      field("surety", "Surety", "Pacific Guarantee Surety Company", 1),
      field("obligee", "Agency / obligee", "City of Montebello", 1, { readOnly: true }),
      field("bidAmount", "Total bid amount", "$185,000.00", 1, { kind: "currency" }),
      field("bidOpeningDate", "Bid opening date", "2026-11-12", 1, { kind: "date" }),
      field("bondPercent", "Bond percentage", "10%", 2, { readOnly: true }),
      field("bondAmount", "Penal sum", "$18,500.00", 2, { kind: "currency", readOnly: true }),
      field("workDescription", "Bid work", "LED sign installation at City Hall", 2),
      field("bondDate", "Bond date", "2026-11-10", 2, { kind: "date" }),
      field("principalSigner", "Bidder representative", "Jordan Diaz", 3),
      field("principalTitle", "Bidder representative title", "", 3, { status: "review" }),
      field("suretySigner", "Surety attorney-in-fact", "Morgan Lee", 3),
      field("notaryCounty", "Notary county", "Los Angeles", 3),
    ],
    pages: [
      {
        subtitle: "FOR LED SIGN CITY HALL · C.P. NO. 933",
        intro:
          "Know all persons by these presents that the bidder and surety are bound unto the City of Montebello for the stated proposal guarantee.",
        sections: [
          {
            heading: "Project and parties",
            fields: [
              "project",
              "projectNumber",
              "principal",
              "principalAddress",
              "surety",
              "obligee",
            ],
            columns: 2,
          },
          { heading: "Bid", fields: ["bidAmount", "bidOpeningDate"], columns: 2 },
        ],
      },
      {
        subtitle: "CONDITIONS OF OBLIGATION",
        intro:
          "This bond secures the bidder's proposal. Its penal sum is ten percent of the total bid amount.",
        sections: [
          {
            heading: "Proposal security",
            fields: ["workDescription", "bondPercent", "bondAmount", "bondDate"],
            columns: 2,
          },
          {
            heading: "Condition",
            body: "If the bid is accepted and the bidder enters the required contract within the specified time, the obligation is void; otherwise it remains in force.",
          },
        ],
      },
      {
        subtitle: "EXECUTION AND NOTARY",
        intro:
          "The parties set their names and titles below. Signature and seal lines remain available for execution.",
        sections: [
          {
            heading: "Authorized representatives",
            fields: ["principalSigner", "principalTitle", "suretySigner", "notaryCounty"],
            columns: 2,
          },
          {
            heading: "Execution",
            signatures: ["Bidder signature", "Surety signature", "Notary public", "Corporate seal"],
          },
        ],
      },
    ],
  },
  {
    id: "caltrans-bidders-bond",
    name: "California Department of Transportation: Bidder’s Bond (DES-OE-0102.3)",
    issuer: "State of California · Department of Transportation",
    formTitle: "BIDDER'S BOND",
    documentCode: "DES-OE-0102.3",
    filename: "Caltrans-Bidders-Bond.pdf",
    kind: "bid",
    style: "state",
    pageSize: "A4",
    bidPercent: 10,
    sourceText:
      "California Department of Transportation bidder's bond, form DES-OE-0102.3. Contract 07-4W8204; bond BB-20481. SR-60 Pavement Rehabilitation in Los Angeles County. Principal: Sierra Roads Inc. Surety: Granite State Surety Co. Total bid: $2,400,000. Penal sum: ten percent ($240,000). Bids open at Sacramento on November 20, 2026. Bond dated November 18, 2026. Principal signer: Elena Ruiz. Attorney-in-fact: Marcus Chen. Surety correspondence address was not supplied.",
    fields: [
      field("contractNumber", "Contract number", "07-4W8204", 1),
      field("bondNumber", "Bond number", "BB-20481", 1),
      field("project", "Work description", "SR-60 Pavement Rehabilitation, Los Angeles County", 1),
      field("principal", "Principal", "Sierra Roads Inc.", 1),
      field("surety", "Surety", "Granite State Surety Co.", 1),
      field("obligee", "Obligee", "State of California, Department of Transportation", 1, {
        readOnly: true,
      }),
      field("bidAmount", "Total bid amount", "$2,400,000.00", 1, { kind: "currency" }),
      field("bidOpeningPlace", "Bid opening place", "Sacramento", 1),
      field("bidOpeningDate", "Bid opening date", "2026-11-20", 1, { kind: "date" }),
      field("bondPercent", "Bond percentage", "10%", 2, { readOnly: true }),
      field("bondAmount", "Penal sum", "$240,000.00", 2, { kind: "currency", readOnly: true }),
      field("suretyAddress", "Surety correspondence address", "", 2, { status: "review" }),
      field("bondDate", "Bond date", "2026-11-18", 2, { kind: "date" }),
      field("principalSigner", "Principal representative", "Elena Ruiz", 3),
      field("attorneyInFact", "Attorney-in-fact", "Marcus Chen", 3),
      field("notaryCounty", "Acknowledgment county", "Sacramento", 3),
    ],
    pages: [
      {
        subtitle: "CONTRACT AND BID DETAILS",
        intro:
          "The principal and surety are bound to the Department of Transportation for the work described in the proposal.",
        sections: [
          {
            heading: "Identification",
            fields: ["contractNumber", "bondNumber", "project"],
            columns: 2,
          },
          {
            heading: "Principal and surety",
            fields: [
              "principal",
              "surety",
              "obligee",
              "bidAmount",
              "bidOpeningPlace",
              "bidOpeningDate",
            ],
            columns: 2,
          },
        ],
      },
      {
        subtitle: "THE CONDITION OF THIS OBLIGATION",
        intro: "The penal sum is ten percent of the principal's total bid for the described work.",
        sections: [
          {
            heading: "Bond security",
            fields: ["bondPercent", "bondAmount", "bondDate", "suretyAddress"],
            columns: 2,
          },
          {
            heading: "Award condition",
            body: "If awarded, the principal must execute the contract and provide the required performance and payment bonds. Otherwise this bidder's bond remains in force.",
          },
        ],
      },
      {
        subtitle: "CALIFORNIA ALL-PURPOSE ACKNOWLEDGMENT",
        intro: "A notary verifies the identity of the persons signing this instrument.",
        sections: [
          {
            heading: "Appearance",
            fields: ["principalSigner", "attorneyInFact", "notaryCounty"],
            columns: 2,
          },
          {
            heading: "Signatures and seal",
            signatures: [
              "Principal signature",
              "Surety signature",
              "Notary public",
              "Official seal",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "lausd-bid-security",
    name: "Los Angeles Unified School District: Bid Security Form (Document 00 4313)",
    issuer: "Los Angeles Unified School District",
    formTitle: "BID SECURITY FORM",
    documentCode: "DOCUMENT 00 4313",
    filename: "LAUSD-Bid-Security-Form-00-4313.pdf",
    kind: "bid",
    style: "school",
    pageSize: "LETTER",
    bidPercent: 10,
    sourceText:
      "Los Angeles Unified School District bid security form, Document 00 4313. Chatsworth EEC – New Early Education Center in an Existing School. Project numbers 10373618 / 231024; contract 2610014; bond LA-2610014-B. Bidder: Canyon Builders Group. Surety: West Coast Bonding Co. Base bid: $3,600,000. Bond: ten percent of base bid ($360,000). Bids open December 4, 2026. Bond valid at least 60 days. Bidder signer: Alicia Park. Surety attorney-in-fact: Dana Brooks. Notary county has not been supplied.",
    fields: [
      field("project", "Project description", "Chatsworth EEC – New Early Education Center", 1),
      field("projectNumber", "Project numbers", "10373618 / 231024", 1),
      field("contractNumber", "Contract number", "2610014", 1),
      field("bondNumber", "Bond number", "LA-2610014-B", 1),
      field("principal", "Bidder", "Canyon Builders Group", 1),
      field("surety", "Surety", "West Coast Bonding Co.", 1),
      field("obligee", "Owner / obligee", "Los Angeles Unified School District", 1, {
        readOnly: true,
      }),
      field("bidAmount", "Base bid amount", "$3,600,000.00", 1, { kind: "currency" }),
      field("bondPercent", "Bond percentage", "10%", 2, { readOnly: true }),
      field("bondAmount", "Amount of bond", "$360,000.00", 2, { kind: "currency", readOnly: true }),
      field("bidOpeningDate", "Bid opening date", "2026-12-04", 2, { kind: "date" }),
      field("validityPeriod", "Minimum validity", "60 days", 2, { readOnly: true }),
      field("suretyAddress", "Surety address", "820 Grand Avenue, Los Angeles, CA 90017", 2),
      field("principalSigner", "Bidder authorized person", "Alicia Park", 3),
      field("principalTitle", "Bidder signer title", "Project Director", 3),
      field("attorneyInFact", "Surety attorney-in-fact", "Dana Brooks", 3),
      field("notaryCounty", "Notary county", "", 3, { status: "review" }),
    ],
    pages: [
      {
        subtitle: "PROJECT AND BOND DETAILS",
        intro:
          "The bidder and surety provide security for the base bid attached to the district's proposal.",
        sections: [
          {
            heading: "Document 00 4313",
            fields: ["project", "projectNumber", "contractNumber", "bondNumber"],
            columns: 2,
          },
          {
            heading: "Bid security",
            fields: ["principal", "surety", "obligee", "bidAmount"],
            columns: 2,
          },
        ],
      },
      {
        subtitle: "BID SECURITY TERMS",
        intro:
          "The bidder and surety are bound to the owner in an amount equal to ten percent of the base bid.",
        sections: [
          {
            heading: "Amount and term",
            fields: [
              "bondPercent",
              "bondAmount",
              "bidOpeningDate",
              "validityPeriod",
              "suretyAddress",
            ],
            columns: 2,
          },
          {
            heading: "Condition",
            body: "If the award is accepted, the bidder must enter the written contract and furnish the required bonds. The bid security remains effective for at least sixty days after the bid opening.",
          },
        ],
      },
      {
        subtitle: "EXECUTION AND ATTORNEY-IN-FACT ACKNOWLEDGMENT",
        intro:
          "Authorized representatives sign below; the power of attorney and acknowledgment accompany the executed form.",
        sections: [
          {
            heading: "Representatives",
            fields: ["principalSigner", "principalTitle", "attorneyInFact", "notaryCounty"],
            columns: 2,
          },
          {
            heading: "Acknowledgment",
            signatures: ["Bidder signature", "Surety signature", "Notary signature", "Notary seal"],
          },
        ],
      },
    ],
  },
  {
    id: "merced-bid-bond",
    name: "Merced Irrigation District: Bid Bond (Appendix 2-A)",
    issuer: "Merced Irrigation District",
    formTitle: "BID BOND",
    documentCode: "APPENDIX 2-A",
    filename: "Merced-Irrigation-District-Bid-Bond.pdf",
    kind: "bid",
    style: "district",
    pageSize: "LETTER",
    sourceText:
      "Merced Irrigation District bid bond for Booster 33/Well 22 Pipeline Replacement, project MID-IFB-2025-11. Bidder: Valley Pipeline Contractors, 2200 Industrial Way, Merced, CA 95341. Surety: Pacific Guarantee Surety Company, 900 Market Street, San Francisco, CA 94103. District: Merced Irrigation District, 744 W 20th St, Merced, CA 95340. Bid due November 14, 2026. Bid amount: $1,120,000. Penal sum: $112,000. Bond dated November 12, 2026. Bidder representative: Aaron Flores, President. Surety representative: Morgan Lee; surety representative title is missing.",
    fields: [
      field("project", "Bid project", "Booster 33/Well 22 Pipeline Replacement", 1),
      field("projectNumber", "Project number", "MID-IFB-2025-11", 1),
      field("principal", "Bidder", "Valley Pipeline Contractors", 1),
      field("principalAddress", "Bidder address", "2200 Industrial Way, Merced, CA 95341", 1),
      field("surety", "Surety", "Pacific Guarantee Surety Company", 1),
      field("suretyAddress", "Surety address", "900 Market Street, San Francisco, CA 94103", 1),
      field("obligee", "District", "Merced Irrigation District", 1, { readOnly: true }),
      field("obligeeAddress", "District address", "744 W 20th St, Merced, CA 95340", 1, {
        readOnly: true,
      }),
      field("bidDueDate", "Bid due date", "2026-11-14", 1, { kind: "date" }),
      field("bidAmount", "Bid amount", "$1,120,000.00", 2, { kind: "currency" }),
      field("bondAmount", "Penal sum", "$112,000.00", 2, { kind: "currency" }),
      field("bondDate", "Date of bond", "2026-11-12", 2, { kind: "date" }),
      field("principalSigner", "Bidder representative", "Aaron Flores", 3),
      field("principalTitle", "Bidder representative title", "President", 3),
      field("suretySigner", "Surety representative", "Morgan Lee", 3),
      field("suretyTitle", "Surety representative title", "", 3, { status: "review" }),
    ],
    pages: [
      {
        subtitle: "BIDDER · SURETY · DISTRICT · BID",
        intro: "The bidder and surety supply the identification and bid details shown below.",
        sections: [
          {
            heading: "Bidder and surety",
            fields: ["principal", "principalAddress", "surety", "suretyAddress"],
            columns: 2,
          },
          {
            heading: "District and bid",
            fields: ["obligee", "obligeeAddress", "project", "projectNumber", "bidDueDate"],
            columns: 2,
          },
        ],
      },
      {
        subtitle: "BOND AND PROPOSAL SECURITY",
        intro: "The stated penal sum secures the bidder's proposal for the district project.",
        sections: [
          { heading: "Bond", fields: ["bidAmount", "bondAmount", "bondDate"], columns: 2 },
          {
            heading: "Obligation",
            body: "The bidder and surety intend to be legally bound, subject to the terms of the bid bond, and execute the form through authorized representatives.",
          },
        ],
      },
      {
        subtitle: "EXECUTION AND ATTESTATION",
        intro: "Bidder and surety execution blocks follow the district's tabular form.",
        sections: [
          {
            heading: "Representatives",
            fields: ["principalSigner", "principalTitle", "suretySigner", "suretyTitle"],
            columns: 2,
          },
          {
            heading: "Signatures",
            signatures: [
              "Bidder signature",
              "Surety signature",
              "Bidder attestation",
              "Surety attestation",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "merced-performance-bond",
    name: "Merced Irrigation District: Performance Bond (Appendix 2-A)",
    issuer: "Merced Irrigation District",
    formTitle: "PERFORMANCE BOND",
    documentCode: "APPENDIX 2-A",
    filename: "Merced-Irrigation-District-Performance-Bond.pdf",
    kind: "performance",
    style: "district",
    pageSize: "LETTER",
    sourceText:
      "Merced Irrigation District performance bond for Booster 33/Well 22 Pipeline Replacement, project MID-IFB-2025-11. Contractor: Valley Pipeline Contractors, 2200 Industrial Way, Merced, CA 95341. Surety: Pacific Guarantee Surety Company, 900 Market Street, San Francisco, CA 94103. District: Merced Irrigation District, 744 W 20th St, Merced, CA 95340. Contract price: $1,120,000. Bond amount: $1,120,000. Contract effective December 1, 2026. Bond dated December 2, 2026. Contractor representative: Aaron Flores; representative title is missing. Surety attorney-in-fact: Morgan Lee.",
    fields: [
      field("project", "Contract description", "Booster 33/Well 22 Pipeline Replacement", 1),
      field("projectNumber", "Project number", "MID-IFB-2025-11", 1),
      field("principal", "Contractor", "Valley Pipeline Contractors", 1),
      field("principalAddress", "Contractor address", "2200 Industrial Way, Merced, CA 95341", 1),
      field("surety", "Surety", "Pacific Guarantee Surety Company", 1),
      field("suretyAddress", "Surety address", "900 Market Street, San Francisco, CA 94103", 1),
      field("obligee", "District", "Merced Irrigation District", 1, { readOnly: true }),
      field("obligeeAddress", "District address", "744 W 20th St, Merced, CA 95340", 1, {
        readOnly: true,
      }),
      field("contractPrice", "Contract price", "$1,120,000.00", 1, { kind: "currency" }),
      field("contractEffectiveDate", "Effective date of contract", "2026-12-01", 2, {
        kind: "date",
      }),
      field("bondAmount", "Bond amount", "$1,120,000.00", 2, { kind: "currency" }),
      field("bondDate", "Date of bond", "2026-12-02", 2, { kind: "date" }),
      field("principalSigner", "Contractor representative", "Aaron Flores", 3),
      field("principalTitle", "Contractor representative title", "", 3, { status: "review" }),
      field("suretySigner", "Surety attorney-in-fact", "Morgan Lee", 3),
      field("suretyTitle", "Surety representative title", "Attorney-in-Fact", 3),
    ],
    pages: [
      {
        subtitle: "CONTRACTOR · SURETY · DISTRICT · CONTRACT",
        intro:
          "The contractor and surety provide the contract identification and price for the district project.",
        sections: [
          {
            heading: "Contractor and surety",
            fields: ["principal", "principalAddress", "surety", "suretyAddress"],
            columns: 2,
          },
          {
            heading: "District and contract",
            fields: ["obligee", "obligeeAddress", "project", "projectNumber", "contractPrice"],
            columns: 2,
          },
        ],
      },
      {
        subtitle: "PERFORMANCE BOND SUMMARY",
        intro: "The bond date must not precede the effective date of the contract.",
        sections: [
          {
            heading: "Bond and contract dates",
            fields: ["contractEffectiveDate", "bondAmount", "bondDate"],
            columns: 2,
          },
          {
            heading: "Performance obligation",
            body: "The contractor and surety intend to be legally bound for performance of the referenced contract, subject to the terms of this bond.",
          },
        ],
      },
      {
        subtitle: "EXECUTION AND ATTESTATION",
        intro:
          "Contractor and surety execution blocks follow the district's performance bond form.",
        sections: [
          {
            heading: "Representatives",
            fields: ["principalSigner", "principalTitle", "suretySigner", "suretyTitle"],
            columns: 2,
          },
          {
            heading: "Signatures",
            signatures: [
              "Contractor signature",
              "Surety signature",
              "Contractor attestation",
              "Surety attestation",
            ],
          },
        ],
      },
    ],
  },
];

type Supplement = {
  fields: BondField[];
  sections: [BondSection[], BondSection[], BondSection[]];
};

const supplements: Record<string, Supplement> = {
  "montebello-proposal-guarantee": {
    fields: [
      demoField("bidderPhone", "Bidder telephone", "(213) 555-0142", 1),
      demoField("bidderEmail", "Bidder email", "bids@westline-electric.example", 1),
      demoField("suretyAddress", "Surety address", "900 Market Street, San Francisco, CA 94103", 1),
      demoField("suretyPhone", "Surety telephone", "(415) 555-0187", 1),
      demoField(
        "penalSumWords",
        "Penal sum in words",
        "Eighteen thousand five hundred dollars",
        2,
        { kind: "multiline", readOnly: true },
      ),
      demoField("proposalSubmitted", "Proposal submitted", true, 2, {
        kind: "checkbox",
        required: false,
      }),
      demoField("powerAttorneyAttached", "Power of attorney attached", true, 2, {
        kind: "checkbox",
        required: false,
      }),
      demoField("proposalDate", "Proposal submission date", "2026-11-10", 2, { kind: "date" }),
      demoField(
        "noticeAddress",
        "Agency notice address",
        "1600 W Beverly Boulevard, Montebello, CA 90640",
        2,
        { kind: "multiline" },
      ),
      demoField("agencyPhone", "Agency notice telephone", "(323) 555-0110", 2),
      demoField("suretySignerTitle", "Surety representative title", "Attorney-in-Fact", 3),
      demoField("suretySignerPhone", "Surety representative telephone", "(415) 555-0187", 3),
      demoField("notaryName", "Notary public name", "Taylor Morgan", 3),
      demoField("notaryDate", "Notary acknowledgment date", "2026-11-10", 3, { kind: "date" }),
      demoField("notaryState", "Notary state", "California", 3),
    ],
    sections: [
      [
        {
          heading: "Supplemental demo — business contacts",
          fields: ["bidderPhone", "bidderEmail", "suretyAddress", "suretyPhone"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — security details",
          fields: ["penalSumWords", "proposalSubmitted", "powerAttorneyAttached"],
          columns: 2,
        },
        {
          heading: "Supplemental demo — proposal notices",
          fields: ["proposalDate", "noticeAddress", "agencyPhone"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — acknowledgment details",
          fields: [
            "suretySignerTitle",
            "suretySignerPhone",
            "notaryName",
            "notaryDate",
            "notaryState",
          ],
          columns: 2,
        },
      ],
    ],
  },
  "caltrans-bidders-bond": {
    fields: [
      demoField(
        "principalAddress",
        "Principal address",
        "1800 Mission Road, Los Angeles, CA 90033",
        1,
      ),
      demoField("principalPhone", "Principal telephone", "(323) 555-0119", 1),
      demoField("suretyPhone", "Surety telephone", "(415) 555-0150", 1),
      demoField("workCounty", "Work county", "Los Angeles", 1),
      demoField("penalSumWords", "Penal sum in words", "Two hundred forty thousand dollars", 2, {
        kind: "multiline",
        readOnly: true,
      }),
      demoField("performanceBondRequired", "Performance bond required", true, 2, {
        kind: "checkbox",
        required: false,
      }),
      demoField("paymentBondRequired", "Payment bond required", true, 2, {
        kind: "checkbox",
        required: false,
      }),
      demoField("proposalDate", "Proposal submission date", "2026-11-18", 2, { kind: "date" }),
      demoField("claimsContact", "Surety claims contact", "Claims Department", 2),
      demoField("claimsPhone", "Surety claims telephone", "(415) 555-0150", 2),
      demoField("notaryName", "Acknowledging officer", "Riley Bennett", 3),
      demoField("acknowledgmentDate", "Acknowledgment date", "2026-11-18", 3, { kind: "date" }),
      demoField("signerCapacity", "Signer's capacity", "Attorney-in-Fact", 3),
      demoField("identityEvidence", "Identity evidence", "Satisfactory evidence", 3, {
        kind: "select",
        options: ["Satisfactory evidence", "Personal knowledge"],
      }),
      demoField("powerAttorneyAttached", "Power of attorney attached", true, 3, {
        kind: "checkbox",
        required: false,
      }),
    ],
    sections: [
      [
        {
          heading: "Supplemental demo — parties and location",
          fields: ["principalAddress", "principalPhone", "suretyPhone", "workCounty"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — bond package",
          fields: ["penalSumWords", "performanceBondRequired", "paymentBondRequired"],
          columns: 2,
        },
        {
          heading: "Supplemental demo — claims contact",
          fields: ["proposalDate", "claimsContact", "claimsPhone"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — notary record",
          fields: [
            "notaryName",
            "acknowledgmentDate",
            "signerCapacity",
            "identityEvidence",
            "powerAttorneyAttached",
          ],
          columns: 2,
        },
      ],
    ],
  },
  "lausd-bid-security": {
    fields: [
      demoField(
        "bidderAddress",
        "Bidder address",
        "4400 Canoga Avenue, Woodland Hills, CA 91364",
        1,
      ),
      demoField("bidderPhone", "Bidder telephone", "(818) 555-0126", 1),
      demoField("suretyPhone", "Surety telephone", "(213) 555-0196", 1),
      demoField("projectLocation", "Project location", "Chatsworth, Los Angeles, California", 1),
      demoField(
        "bondAmountWords",
        "Bond amount in words",
        "Three hundred sixty thousand dollars",
        2,
        { kind: "multiline", readOnly: true },
      ),
      demoField("validityEndDate", "Minimum validity through", "2027-02-02", 2, { kind: "date" }),
      demoField("certifiedPowerAttached", "Certified power of attorney attached", true, 2, {
        kind: "checkbox",
        required: false,
      }),
      demoField("bidPackageReference", "Bid package reference", "LAUSD-2610014", 2),
      demoField("attorneyPhone", "Attorney-in-fact telephone", "(213) 555-0196", 3),
      demoField("notaryState", "Notary state", "California", 3),
      demoField("notaryDate", "Notary acknowledgment date", "2026-12-02", 3, { kind: "date" }),
      demoField("notaryName", "Notary public name", "Cameron Wells", 3),
      demoField("acknowledgmentAttached", "Acknowledgment attached", true, 3, {
        kind: "checkbox",
        required: false,
      }),
    ],
    sections: [
      [
        {
          heading: "Supplemental demo — party contacts",
          fields: ["bidderAddress", "bidderPhone", "suretyPhone", "projectLocation"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — coverage record",
          fields: [
            "bondAmountWords",
            "validityEndDate",
            "certifiedPowerAttached",
            "bidPackageReference",
          ],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — notary record",
          fields: [
            "attorneyPhone",
            "notaryState",
            "notaryDate",
            "notaryName",
            "acknowledgmentAttached",
          ],
          columns: 2,
        },
      ],
    ],
  },
  "merced-bid-bond": {
    fields: [
      demoField("projectLocation", "Project location", "Merced County, California", 1),
      demoField("bidderPhone", "Bidder telephone", "(209) 555-0133", 1),
      demoField("bidderEmail", "Bidder email", "contracts@valleypipeline.example", 1),
      demoField("suretyPhone", "Surety telephone", "(415) 555-0187", 1),
      demoField("penalSumWords", "Penal sum in words", "One hundred twelve thousand dollars", 2, {
        kind: "multiline",
        readOnly: true,
      }),
      demoField("noticeMethod", "Notice delivery method", "Postal mail", 2, {
        kind: "select",
        options: ["Postal mail", "Courier", "Email"],
      }),
      demoField("additionalParties", "Additional parties schedule attached", false, 2, {
        kind: "checkbox",
        required: false,
      }),
      demoField("bidPackageReference", "Bid package reference", "MID-IFB-2025-11", 2),
      demoField("noticeAddress", "Notice address", "744 W 20th St, Merced, CA 95340", 2, {
        kind: "multiline",
      }),
      demoField("claimsPhone", "Surety claims telephone", "(415) 555-0187", 2),
      demoField("bidderAttestor", "Bidder attestor name", "Maria Vega", 3),
      demoField("bidderAttestorTitle", "Bidder attestor title", "Secretary", 3),
      demoField("suretyAttestor", "Surety attestor name", "Devon Price", 3),
      demoField("suretyAttestorTitle", "Surety attestor title", "Assistant Secretary", 3),
      demoField("powerAttorneyAttached", "Power of attorney attached", true, 3, {
        kind: "checkbox",
        required: false,
      }),
    ],
    sections: [
      [
        {
          heading: "Supplemental demo — bid contacts",
          fields: ["projectLocation", "bidderPhone", "bidderEmail", "suretyPhone"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — bond administration",
          fields: ["penalSumWords", "noticeMethod", "additionalParties"],
          columns: 2,
        },
        {
          heading: "Supplemental demo — notice record",
          fields: ["bidPackageReference", "noticeAddress", "claimsPhone"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — attestation",
          fields: [
            "bidderAttestor",
            "bidderAttestorTitle",
            "suretyAttestor",
            "suretyAttestorTitle",
            "powerAttorneyAttached",
          ],
          columns: 2,
        },
      ],
    ],
  },
  "merced-performance-bond": {
    fields: [
      demoField("contractLocation", "Contract location", "Merced County, California", 1),
      demoField("contractorPhone", "Contractor telephone", "(209) 555-0133", 1),
      demoField("contractorEmail", "Contractor email", "contracts@valleypipeline.example", 1),
      demoField("suretyPhone", "Surety telephone", "(415) 555-0187", 1),
      demoField(
        "bondAmountWords",
        "Bond amount in words",
        "One million one hundred twenty thousand dollars",
        2,
        { kind: "multiline", readOnly: true },
      ),
      demoField("noticeMethod", "Notice delivery method", "Postal mail", 2, {
        kind: "select",
        options: ["Postal mail", "Courier", "Email"],
      }),
      demoField("additionalParties", "Additional parties schedule attached", false, 2, {
        kind: "checkbox",
        required: false,
      }),
      demoField("contractReference", "Contract reference", "MID-IFB-2025-11", 2),
      demoField("targetCompletionDate", "Target completion date", "2027-08-31", 2, {
        kind: "date",
      }),
      demoField("claimsPhone", "Surety claims telephone", "(415) 555-0187", 2),
      demoField("contractorAttestor", "Contractor attestor name", "Maria Vega", 3),
      demoField("contractorAttestorTitle", "Contractor attestor title", "Secretary", 3),
      demoField("suretyAttestor", "Surety attestor name", "Devon Price", 3),
      demoField("suretyAttestorTitle", "Surety attestor title", "Assistant Secretary", 3),
      demoField("powerAttorneyAttached", "Power of attorney attached", true, 3, {
        kind: "checkbox",
        required: false,
      }),
    ],
    sections: [
      [
        {
          heading: "Supplemental demo — contract contacts",
          fields: ["contractLocation", "contractorPhone", "contractorEmail", "suretyPhone"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — performance administration",
          fields: ["bondAmountWords", "noticeMethod", "additionalParties"],
          columns: 2,
        },
        {
          heading: "Supplemental demo — contract schedule",
          fields: ["contractReference", "targetCompletionDate", "claimsPhone"],
          columns: 2,
        },
      ],
      [
        {
          heading: "Supplemental demo — attestation",
          fields: [
            "contractorAttestor",
            "contractorAttestorTitle",
            "suretyAttestor",
            "suretyAttestorTitle",
            "powerAttorneyAttached",
          ],
          columns: 2,
        },
      ],
    ],
  },
};

export const bondTemplates: BondTemplate[] = baseBondTemplates.map((template) => {
  const supplement = supplements[template.id];
  if (!supplement) return template;
  const sourceDetails = supplement.fields
    .map(
      (entry) =>
        `${entry.label}: ${entry.kind === "checkbox" ? (entry.value ? "yes" : "no") : entry.value || "not supplied"}`,
    )
    .join("; ");
  return {
    ...template,
    sourceText: `${template.sourceText} Supplemental demo details: ${sourceDetails}.`,
    fields: [...template.fields, ...supplement.fields],
    pages: template.pages.map((page, index) => {
      const supplementSections = supplement.sections[index] ?? [];
      const signatureSections = page.sections.filter((section) => section.signatures);
      return {
        ...page,
        sections: [
          ...page.sections.filter((section) => !section.signatures),
          ...supplementSections,
          ...signatureSections,
        ],
      };
    }) as [BondPage, BondPage, BondPage],
  };
});

export function initialBondValues(template: BondTemplate): BondValues {
  return Object.fromEntries(template.fields.map(({ id, value }) => [id, value]));
}

export function bondFieldValue(field: BondField, values: BondValues): BondFieldValue {
  return values[field.id] ?? field.value;
}

export function isBondFieldMapped(field: BondField, values: BondValues): boolean {
  const value = bondFieldValue(field, values);
  return field.kind === "checkbox" ? typeof value === "boolean" : String(value).trim().length > 0;
}

export function currencyCents(value: string): number | null {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "", fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function currencyWords(cents: number): string {
  const small = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const scales = ["", "thousand", "million", "billion", "trillion"];
  const underThousand = (value: number): string => {
    const parts: string[] = [];
    if (value >= 100) {
      parts.push(`${small[Math.floor(value / 100)]} hundred`);
      value %= 100;
    }
    if (value >= 20) {
      parts.push(`${tens[Math.floor(value / 10)]}${value % 10 ? `-${small[value % 10]}` : ""}`);
    } else if (value > 0) {
      parts.push(small[value] ?? "");
    }
    return parts.join(" ");
  };
  const dollars = Math.floor(cents / 100);
  const words: string[] = [];
  let remainder = dollars;
  for (let group = 0; remainder > 0 && group < scales.length; group++) {
    const chunk = remainder % 1000;
    if (chunk) words.unshift(`${underThousand(chunk)} ${scales[group]}`.trim());
    remainder = Math.floor(remainder / 1000);
  }
  const dollarWords = (words.join(" ") || "zero").replace(/^./, (letter) => letter.toUpperCase());
  const centAmount = cents % 100;
  return `${dollarWords} dollar${dollars === 1 ? "" : "s"}${centAmount ? ` and ${underThousand(centAmount)} cent${centAmount === 1 ? "" : "s"}` : ""}`;
}

export function displayBondValue(field: BondField, values: BondValues): string {
  const value = bondFieldValue(field, values);
  if (field.kind === "checkbox") return value === true ? "Checked" : "Unchecked";
  if (typeof value !== "string" || !value) return "";
  if (field.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00Z`),
    );
  }
  if (field.kind === "currency") {
    const cents = currencyCents(value);
    return cents === null ? value : formatCurrency(cents);
  }
  return value;
}

export function bondValidationError(template: BondTemplate, values: BondValues): string | null {
  const missing = template.fields.find(
    (field) => field.required && !isBondFieldMapped(field, values),
  );
  if (missing) return `${missing.label} is required.`;

  for (const field of template.fields) {
    if (
      field.kind === "currency" &&
      currencyCents(String(bondFieldValue(field, values))) === null
    ) {
      return `Enter a valid amount for ${field.label}.`;
    }
  }

  const amountWords = template.fields.find((field) =>
    ["penalSumWords", "bondAmountWords"].includes(field.id),
  );
  if (amountWords) {
    const cents = currencyCents(String(values["bondAmount"] ?? ""));
    if (cents !== null && String(values[amountWords.id] ?? "") !== currencyWords(cents)) {
      return `${amountWords.label} must match the bond amount.`;
    }
  }

  if (template.kind === "performance") {
    const effective = String(values["contractEffectiveDate"] ?? "");
    const bondDate = String(values["bondDate"] ?? "");
    if (bondDate < effective) return "Bond date cannot be before the contract effective date.";
  }
  return null;
}
