<template>
  <v-container fluid class="text-center">
    <v-row justify="center" class="full-height">
      <v-col class="top-spacing" cols="12" md="8">
        <div class="privacy-content">
          <h1 class="font-weight-bold mb-4">Privacy Policy</h1>
          <p class="text-muted mb-6"><strong>Last updated:</strong> 2025-11-01</p>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">1) Who we are</h2>
            <p><strong>Controller:</strong> CTO Roundtable ("we", "us", "our")</p>
            <p><strong>Website:</strong> <a href="https://www.ctoroundtable.no/" target="_blank">https://www.ctoroundtable.no/</a></p>
            <p><strong>Address:</strong> Økernveien 169, Oslo, Norway</p>
            <p><strong>Email:</strong> <a href="mailto:privacy@ctoroundtable.no">privacy@ctoroundtable.no</a></p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">2) Scope</h2>
            <p>This policy covers how we process personal data when you visit our website or contact us. We operate in <strong>Norway/EEA</strong>.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">3) What we collect</h2>
            <ul class="text-left">
              <li><strong>Technical/server logs:</strong> IP address, date/time, URL, referrer, and basic browser/device info for security and troubleshooting.</li>
              <li><strong>Contact information (if you email us):</strong> Your email address and any details you include.</li>
            </ul>
            <p class="mt-3">We do <strong>not</strong> use non-essential cookies or advertising trackers on our site.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">4) Why we process data & legal bases (GDPR)</h2>
            <ul class="text-left">
              <li><strong>Operate and secure the website</strong> (fraud prevention, diagnostics). <em>Legal basis:</em> <strong>Legitimate interests</strong> (Art. 6(1)(f)).</li>
              <li><strong>Respond to inquiries</strong> you send us. <em>Legal basis:</em> <strong>Legitimate interests</strong> (Art. 6(1)(f)) or <strong>Contract</strong> (Art. 6(1)(b)) where applicable.</li>
              <li><strong>Legal compliance</strong> (e.g., fulfilling lawful requests). <em>Legal basis:</em> <strong>Legal obligation</strong> (Art. 6(1)(c)).</li>
            </ul>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">5) Cookies</h2>
            <p>We only use <strong>strictly necessary</strong> cookies (if any) required for basic site operation. We do <strong>not</strong> run analytics, advertising, or retargeting cookies.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">6) Sharing & processors</h2>
            <p>We may use a hosting provider to run the website. Providers act under contract and process data on our instructions. We do <strong>not</strong> sell personal data.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">7) International transfers</h2>
            <p>We aim to keep data in the EEA. If a transfer outside the EEA occurs, we use appropriate safeguards (e.g., <strong>EU Standard Contractual Clauses</strong>).</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">8) Retention</h2>
            <ul class="text-left">
              <li><strong>Server logs:</strong> kept for up to <strong>90 days</strong> unless longer is needed to investigate security incidents.</li>
              <li><strong>Contact emails:</strong> kept as long as needed to handle your request and for routine business archiving.</li>
            </ul>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">9) Your rights</h2>
            <p>You can <strong>access</strong>, <strong>rectify</strong>, <strong>erase</strong>, <strong>restrict</strong>, or <strong>object</strong> to processing and request <strong>data portability</strong>. To exercise rights, email <strong><a href="mailto:privacy@ctoroundtable.no">privacy@ctoroundtable.no</a></strong>.</p>
            <p class="mt-3">You may lodge a complaint with <strong>Datatilsynet</strong> (Norway's supervisory authority).</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">10) Security</h2>
            <p>We use appropriate technical and organizational measures such as HTTPS, access controls, and least-privilege practices.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">11) Children</h2>
            <p>Our website is not directed to children under <strong>16</strong> and we do not knowingly collect their data.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">12) LinkedIn note</h2>
            <p>Our website does <strong>not</strong> include LinkedIn Insight Tag, Ads/retargeting, Lead Gen Forms, or "Sign in with LinkedIn." Any use of LinkedIn is internal to our organization or occurs directly on LinkedIn's platform and is governed by <strong>LinkedIn's Privacy Policy</strong>.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">13) Changes</h2>
            <p>We may update this policy. Changes will be posted here with an updated "Last updated" date.</p>
          </section>

          <section class="mb-6">
            <h2 class="font-weight-bold mb-3">14) Contact</h2>
            <p>Questions or requests: <strong><a href="mailto:privacy@ctoroundtable.no">privacy@ctoroundtable.no</a></strong></p>
            <p>Address: <strong>Økernveien 169, Oslo, Norway</strong></p>
          </section>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
</script>

<style scoped>
.top-spacing {
  margin-top: 3rem;
}

.privacy-content {
  text-align: left;
  line-height: 1.8;
}

.privacy-content h1 {
  text-align: center;
  margin-bottom: 1rem;
}

.privacy-content h2 {
  margin-top: 2rem;
  font-size: 1.5rem;
}

.privacy-content p {
  margin-bottom: 0.75rem;
  font-size: 16px;
}

.privacy-content ul {
  margin-left: 1.5rem;
  margin-bottom: 1rem;
}

.privacy-content ul li {
  margin-bottom: 0.5rem;
}

.privacy-content a {
  color: #90caf9;
  text-decoration: none;
}

.privacy-content a:hover {
  text-decoration: underline;
}

.text-muted {
  opacity: 0.8;
}

.mb-3 {
  margin-bottom: 0.75rem;
}

.mb-4 {
  margin-bottom: 1rem;
}

.mb-6 {
  margin-bottom: 1.5rem;
}

.mt-3 {
  margin-top: 0.75rem;
}
</style>
