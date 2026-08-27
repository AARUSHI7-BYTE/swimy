export type TermsBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export type TermsSection = {
  heading: string;
  blocks: TermsBlock[];
};

export const termsSections: TermsSection[] = [
  {
    heading: "1. Introduction",
    blocks: [
      {
        type: "p",
        text: 'Welcome to Swimy.ai ("Platform", "App", "we", "our", or "us"). The Platform enables users to access partnered swimming facilities through a digital entry-exit and pay-per-minute usage system. By registering, accessing, or using the Platform, you agree to comply with and be bound by these Terms and Conditions ("Terms"). If you do not agree with these Terms, please do not use the Platform.',
      },
    ],
  },
  {
    heading: "2. Eligibility",
    blocks: [
      {
        type: "ul",
        items: [
          "Users must be at least 18 years of age or have consent from a parent/legal guardian.",
          "Users must provide accurate and complete registration details.",
          "The Platform reserves the right to suspend or terminate accounts found providing false information.",
        ],
      },
    ],
  },
  {
    heading: "3. Nature of Service",
    blocks: [
      {
        type: "p",
        text: "The Platform acts as a technology intermediary facilitating: digital pool access, entry and exit tracking, usage-based billing, and booking and payment management. The actual swimming facilities are owned and operated by third-party pool operators.",
      },
    ],
  },
  {
    heading: "4. User Responsibilities",
    blocks: [
      { type: "p", text: "Users agree to:" },
      {
        type: "ul",
        items: [
          "Follow all pool rules, hygiene standards, and safety protocols.",
          "Use valid entry credentials issued through the Platform.",
          "Maintain discipline and appropriate conduct at pool premises.",
          "Carry necessary swimwear and equipment as mandated by the pool operator.",
          "Avoid sharing account credentials or QR access codes with others.",
        ],
      },
      {
        type: "p",
        text: "Users shall be solely responsible for their belongings, health conditions, and personal safety while using the swimming facility.",
      },
    ],
  },
  {
    heading: "5. Entry and Exit System",
    blocks: [
      {
        type: "ul",
        items: [
          "Charges are calculated based on the duration between digital check-in and check-out recorded through the Platform.",
          "Users must ensure proper entry and exit scans/check-ins.",
          "Failure to properly check out may result in additional charges based on maximum session limits determined by the facility.",
          "Unauthorized access or bypassing the entry system may result in suspension of account access.",
        ],
      },
    ],
  },
  {
    heading: "6. Payments and Refunds",
    blocks: [
      {
        type: "p",
        text: "All payments shall be made through approved payment methods available on the Platform. Usage fees, taxes, convenience charges, or platform fees may apply. Payments once processed are generally non-refundable unless a technical error occurs, access is denied due to facility issues, or refund approval is granted by the Platform. Refund timelines may vary depending on payment providers and banking partners.",
      },
    ],
  },
  {
    heading: "7. Health and Safety Disclaimer",
    blocks: [
      {
        type: "p",
        text: "Users acknowledge that swimming and related physical activities involve inherent risks. By using the Platform and facilities, users confirm that:",
      },
      {
        type: "ul",
        items: [
          "They are medically fit to participate in swimming activities.",
          "They understand and voluntarily assume all associated risks.",
          "The Platform shall not be liable for injuries, medical emergencies, accidents, drowning incidents, allergic reactions, infections, or loss/damage of personal belongings occurring at partner facilities.",
        ],
      },
      {
        type: "p",
        text: "Users are advised to consult a medical professional before engaging in physical activity.",
      },
    ],
  },
  {
    heading: "8. Facility Rules",
    blocks: [
      {
        type: "p",
        text: "Each swimming facility may have additional rules including but not limited to: dress code requirements, hygiene protocols, shower requirements before entry, restrictions on food/alcohol/smoking, time limitations, and coaching or training restrictions. Users agree to comply with such facility-specific regulations.",
      },
    ],
  },
  {
    heading: "9. Account Suspension and Termination",
    blocks: [
      {
        type: "p",
        text: "The Platform reserves the right to suspend, restrict, or terminate user access without prior notice for: violation of these Terms, misconduct at facilities, fraudulent payment activity, damage to property, or harassment or unsafe behavior.",
      },
    ],
  },
  {
    heading: "10. Limitation of Liability",
    blocks: [
      {
        type: "p",
        text: "To the maximum extent permitted by law, the Platform shall not be liable for indirect, incidental, special, or consequential damages. Liability, if any, shall be limited to the amount paid by the user for the specific transaction in dispute.",
      },
    ],
  },
  {
    heading: "11. Privacy",
    blocks: [
      {
        type: "p",
        text: "User data shall be collected and processed in accordance with the Platform's Privacy Policy. The Platform may collect name and contact information, usage history, payment details, location or access logs, and device information. Such data may be used for operational, security, analytical, and service improvement purposes.",
      },
    ],
  },
  {
    heading: "12. Intellectual Property",
    blocks: [
      {
        type: "p",
        text: "All trademarks, logos, designs, software, and content on the Platform are the intellectual property of Swimy.ai and may not be copied, reproduced, or used without prior written permission.",
      },
    ],
  },
  {
    heading: "13. Force Majeure",
    blocks: [
      {
        type: "p",
        text: "The Platform shall not be held liable for service interruptions caused by events beyond reasonable control, including natural disasters, government restrictions, pandemic-related closures, technical outages, or labor disputes.",
      },
    ],
  },
  {
    heading: "14. Governing Law and Jurisdiction",
    blocks: [
      {
        type: "p",
        text: "These Terms shall be governed by and interpreted in accordance with the laws of India. Any disputes arising out of these Terms shall be subject to the exclusive jurisdiction of the courts of India.",
      },
    ],
  },
  {
    heading: "15. Amendments",
    blocks: [
      {
        type: "p",
        text: "The Platform reserves the right to modify or update these Terms at any time. Continued use of the Platform after such changes constitutes acceptance of the revised Terms.",
      },
    ],
  },
];

export const termsAcknowledgment =
  "By using the Platform, the user acknowledges that they have read, understood, and agreed to these Terms and Conditions.";
