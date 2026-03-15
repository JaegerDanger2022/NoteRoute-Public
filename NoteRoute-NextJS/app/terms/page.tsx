import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — NoteRoute",
  description: "Terms and conditions for using NoteRoute.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mb-10">
          Last updated: 1 March 2026
        </p>

        <Section title="1. Acceptance of Terms">
          <p>
            By creating an account or using NoteRoute (&quot;NoteRoute&quot;, &quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;) — including the web application at{" "}
            <a href="https://noteroute.click" className="underline">noteroute.click</a> and
            the NoteRoute mobile app for iOS and Android — you agree to be bound by these
            Terms of Service (&quot;Terms&quot;). If you do not agree, do not use the service.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 13 years old (or 16 where required by applicable law) to use
            NoteRoute. By using the service you represent that you meet this requirement. If you
            are using NoteRoute on behalf of an organisation, you represent that you have
            authority to bind that organisation to these Terms.
          </p>
        </Section>

        <Section title="3. Description of Service">
          <p>
            NoteRoute is a voice and image note-routing service. You record a voice note or
            capture an image; NoteRoute transcribes or extracts the content, finds the
            best-matching destination you have configured (&quot;Slot&quot;), and delivers the
            content to a connected third-party integration (Notion, Google Docs/Drive, Slack,
            Todoist, or Trello).
          </p>
          <p className="mt-2">
            The service is provided on a tiered subscription basis. Free-tier limits apply
            where stated. Features and limits may change over time with reasonable notice.
          </p>
        </Section>

        <Section title="4. Accounts">
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>
              You must notify us immediately at{" "}
              <a href="mailto:support@noteroute.click" className="underline">support@noteroute.click</a>{" "}
              if you suspect unauthorised access to your account.
            </li>
            <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
          </ul>
        </Section>

        <Section title="5. Acceptable Use">
          <p>You agree not to use NoteRoute to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Upload, transmit, or store content that is unlawful, harmful, abusive, defamatory, or infringing on any third-party rights.</li>
            <li>Attempt to gain unauthorised access to our systems or another user&apos;s data.</li>
            <li>Reverse-engineer, decompile, or otherwise attempt to extract the source code of NoteRoute.</li>
            <li>Use the service in any way that could damage, disable, or impair our infrastructure.</li>
            <li>Resell or sublicense access to the service without our written consent.</li>
            <li>Violate any applicable local, national, or international law or regulation.</li>
          </ul>
        </Section>

        <Section title="6. Third-Party Integrations">
          <p>
            NoteRoute connects to third-party services (Notion, Google, Slack, Todoist, Trello)
            on your behalf using OAuth tokens you authorise. Your use of those services is
            governed by their respective terms of service. We are not responsible for the
            availability, accuracy, or actions of those third-party platforms.
          </p>
          <p className="mt-2">
            By connecting an integration, you grant NoteRoute permission to read and write
            content to that service only as necessary to deliver your notes to the slots you
            have configured. You can revoke this permission at any time by disconnecting the
            integration from the app.
          </p>
        </Section>

        <Section title="7. Bring Your Own LLM / Integration (BYOLLM / BYOI)">
          <p>
            If you supply your own API keys (OpenAI, Anthropic, Pinecone, AWS Bedrock), you
            are responsible for ensuring your use of those services complies with their
            respective terms. We store your keys encrypted at rest and use them solely to
            process your requests. We accept no liability for charges incurred on your
            third-party accounts as a result of using NoteRoute.
          </p>
        </Section>

        <Section title="8. Intellectual Property">
          <SubSection title="8.1 Your Content">
            <p>
              You retain full ownership of the voice recordings, images, transcripts, and notes
              you submit through NoteRoute. By using the service, you grant NoteRoute a limited,
              non-exclusive, royalty-free licence to process and transmit your content solely
              for the purpose of providing the service to you. We do not use your content to
              train AI models.
            </p>
          </SubSection>
          <SubSection title="8.2 Our Property">
            <p>
              NoteRoute, its logo, software, and all associated intellectual property are owned
              by NoteRoute. Nothing in these Terms grants you any right to use our trademarks,
              trade names, or branding.
            </p>
          </SubSection>
        </Section>

        <Section title="9. Subscriptions & Payments">
          <p>
            Paid tiers are billed on a subscription basis through our payment processor
            (RevenueCat / Apple App Store / Google Play). All fees are stated in USD and are
            non-refundable except where required by law or at our sole discretion. We reserve
            the right to change pricing with at least 14 days&apos; notice. Continued use of a
            paid tier after a price change constitutes acceptance of the new price.
          </p>
          <p className="mt-2">
            If a payment fails, your account will be downgraded to the free tier. Data is not
            deleted immediately upon downgrade — you will retain access to existing routes and
            slots up to free-tier limits.
          </p>
        </Section>

        <Section title="10. Disclaimers">
          <p>
            NoteRoute is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any
            kind, either express or implied, including but not limited to warranties of
            merchantability, fitness for a particular purpose, or non-infringement. We do not
            warrant that the service will be uninterrupted, error-free, or that transcriptions
            or note routing will be accurate.
          </p>
        </Section>

        <Section title="11. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, NoteRoute and its operators
            shall not be liable for any indirect, incidental, special, consequential, or
            punitive damages, including loss of data, loss of profits, or business interruption,
            arising from your use of or inability to use the service, even if we have been
            advised of the possibility of such damages.
          </p>
          <p className="mt-2">
            Our total aggregate liability to you for any claim arising out of or relating to
            these Terms or the service shall not exceed the amount you paid us in the three
            months preceding the claim, or USD $10, whichever is greater.
          </p>
        </Section>

        <Section title="12. Indemnification">
          <p>
            You agree to indemnify and hold harmless NoteRoute and its operators from any
            claims, damages, losses, or expenses (including reasonable legal fees) arising from
            your use of the service, your violation of these Terms, or your infringement of any
            third-party rights.
          </p>
        </Section>

        <Section title="13. Termination">
          <p>
            You may delete your account at any time from the app settings. We may suspend or
            terminate your access immediately if you breach these Terms, or with 30 days&apos;
            notice for any other reason. Upon termination, your data will be handled as
            described in our{" "}
            <a href="/privacy" className="underline">Privacy Policy</a>.
          </p>
        </Section>

        <Section title="14. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify you of material changes
            by email or via an in-app notice at least 14 days before they take effect. Continued
            use of NoteRoute after the effective date constitutes acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="15. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the laws of Ghana,
            without regard to conflict-of-law principles. Any disputes shall be subject to the
            exclusive jurisdiction of the courts of Ghana, unless otherwise required by the
            mandatory laws of your country of residence.
          </p>
        </Section>

        <Section title="16. Contact">
          <p>
            For questions about these Terms, contact us at{" "}
            <a href="mailto:support@noteroute.click" className="underline">
              support@noteroute.click
            </a>
            .
          </p>
        </Section>

        <p className="mt-16 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} NoteRoute. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="text-muted-foreground space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 className="font-medium text-foreground mb-1">{title}</h3>
      {children}
    </div>
  );
}
