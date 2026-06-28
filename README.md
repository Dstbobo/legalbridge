# LegalBridge

**Nigerian Legal Assistant — AI-powered legal guidance, document drafting, and lawyer connections for every Nigerian.**

Built by **DST Global Innovative Nigeria Ltd**.

---

## What is LegalBridge?

LegalBridge is a full-stack legal technology platform designed specifically for the Nigerian legal system. It combines AI-powered legal research, automated document drafting, and a lawyer marketplace into a single mobile application.

The platform serves two distinct user categories:

| Category | Who | Experience |
|---|---|---|
| **Legal Professionals** | Lawyers, Law Students | Case research, statute analysis, moot prep, document drafting, mentorship board |
| **General Users** | Individuals, Businesses, Journalists, Others | Plain-language legal guidance, document generation, lawyer booking |

---

## Core Features

### AI Chat (Ask AI)
- Conversational legal assistant trained on Nigerian law
- Understands CFRN, Evidence Act, Land Use Act, company law, criminal law, family law, employment law, and more
- Streams responses in real time (Server-Sent Events)
- Full Markdown rendering: headings, bold, lists, code blocks, tables
- Context-aware: different starter prompts for lawyers vs. general users

### Document Drafting
- AI-powered document generation under Nigerian law
- Supported types: tenancy agreements, affidavits, deeds of assignment, powers of attorney, employment contracts, NDAs, MOUs, demand letters, petitions, court motions, and more
- Actions after generation: Save to Documents · Share to WhatsApp · Share · Print

### Lawyer Marketplace
- Browse verified Nigerian lawyers
- Filter by specialty: Land & Property, Criminal, Corporate, Family Law, Employment, Human Rights
- Full lawyer profiles: specialties, experience, consultation rate, rating, reviews, bio
- Book Consultation: describe issue, send request, lawyer responds within 24 hours
- WhatsApp Direct Contact
- Uber-style flow: user requests, lawyer accepts or declines

### Lawyer Self-Registration (Currently Free)
- Legal professionals register directly in-app
- Profile includes: name, firm, bar number, specialties, location, rate, bio, WhatsApp
- Appears in the directory immediately upon submission
- Free during early growth phase
- Payment gate activates at 50-100 registered lawyers
- Future: profile boosting, case win tracker, performance dashboard

### My Cases and Documents
- Chat history per case
- All drafted documents saved and accessible
- Future: Registrations and Compliance tracker, Research Tools library

### Mentorship
- Legal Professionals: Connect with senior lawyers, find pupillage opportunities, career events
- General Users: Quick access to lawyer booking and consultation options

---

## Tech Stack

### Mobile App

| Layer | Technology |
|---|---|
| Framework | React Native via Expo SDK 56 |
| Navigation | expo-router (file-based routing) |
| UI Library | react-native-paper (MD3) |
| State Management | Zustand |
| Auth | Supabase PKCE + expo-secure-store |
| API Client | Axios with Supabase JWT interceptor |
| Markdown | react-native-markdown-display |
| OTA Updates | expo-updates (EAS Update) |
| Build | EAS Build (Expo Application Services) |

### Backend

| Service | Role |
|---|---|
| Supabase (qcutjnsxiawnejiqwwix) | Auth, database, file storage, Edge Functions |
| FastAPI / NestJS (api.legalbridge.ng) | AI routing, document generation, profile management |
| Supabase Edge Function: chat-stream | AI chat streaming (SSE) |
| /v1/documents endpoint | Document generation |

---

## Project Structure

```
legalbridge/
├── mobile/                            React Native / Expo app
│   ├── app/
│   │   ├── _layout.tsx                Root layout: AuthGuard, PaperProvider
│   │   ├── index.tsx                  Entry redirect
│   │   ├── (auth)/
│   │   │   ├── landing.tsx            Sign in / Sign up hero screen
│   │   │   ├── login.tsx              Email login
│   │   │   ├── register.tsx           Email registration
│   │   │   ├── onboarding-role.tsx    Category selection (2 categories)
│   │   │   └── onboarding-details.tsx Additional profile details
│   │   ├── (main)/
│   │   │   ├── chat.tsx               Main screen with 4-tab bottom nav
│   │   │   ├── settings.tsx           Profile and settings
│   │   │   ├── lawyers.tsx            Lawyer directory and booking
│   │   │   ├── history.tsx            Chat history
│   │   │   └── documents.tsx          Saved documents
│   │   └── (legal)/
│   │       ├── privacy.tsx            Privacy policy
│   │       └── terms.tsx              Terms of service
│   ├── components/
│   │   └── brand/
│   │       └── LegalBridgeLogo.tsx    "Legal" + italic gold "Bridge" wordmark
│   ├── constants/
│   │   ├── theme.ts                   Colors: primary navy #1a3a6e, accent gold #f4c146
│   │   └── roles.ts                   legal_professional | general_user
│   ├── services/
│   │   ├── auth.service.ts            Supabase client, signIn, signUp, Google OAuth
│   │   ├── api.ts                     Axios client with JWT interceptor
│   │   └── chat.service.ts            streamChat() and streamDocument() via SSE
│   ├── stores/
│   │   ├── auth.store.ts              Zustand: user, token, onboarding state
│   │   └── chat.store.ts              Zustand: messages, streaming, mode
│   ├── app.json                       Expo config: package ng.legalbridge.app
│   ├── eas.json                       EAS profiles: mvp (APK), production (AAB)
│   └── .npmrc                         legacy-peer-deps=true (required for EAS)
│
├── supabase/                          Supabase config and Edge Functions
├── chat.html                          Original web app (reference only)
├── lawyers.html                       Original lawyers page (reference only)
├── login.html                         Original login (reference only)
└── settings.html                      Original settings (reference only)
```

---

## Navigation Architecture

```
App
├── (auth) Stack
│   ├── /landing              Hero screen, Google OAuth, email sign in/register
│   ├── /login
│   ├── /register
│   ├── /onboarding-role      Pick: Legal Professional or General User
│   └── /onboarding-details
│
└── (main) Stack
    ├── /chat                 Root screen with 4-tab bottom nav:
    │   ├── AI Chat           Home screen + chat (Ask AI / Draft Document)
    │   ├── Mentorship        Lawyer booking (general) or mentorship board (pro)
    │   ├── Messages          Direct messages with lawyers
    │   └── Profile           Account, settings, documents, sign out
    ├── /lawyers              Full lawyer directory and booking
    ├── /history              Chat history
    ├── /documents            My documents
    └── /settings             Profile settings

    (legal) Stack
    ├── /privacy
    └── /terms
```

---

## Screen Details

### AI Chat Home Screen
- LB logo (rounded square) at top center
- Greeting: "Good morning, [Name]."
- Subtitle: "Your Nigerian law research companion, built for Nigerian law."
- 4 Quick Action cards (context-aware by role):
  - Legal Professionals: CASE SUMMARY, MOOT COURT, LEGAL PRINCIPLE, STATUTE GUIDE
  - General Users: TENANT RIGHTS, BUSINESS LAW, EMPLOYMENT, FAMILY LAW
- Input bar: + (attach) | "Reply to LegalBridge..." | Mic / Send / Stop

### Side Drawer (Hamburger Menu)
- LegalBridge wordmark at top
- + New case full-width button
- Menu items: My Cases, Documents, Registrations and Compliance, Research Tools
- RECENT section: last visited case titles with document icon
- Settings pinned at bottom

### Bottom Navigation (4 tabs)
```
[ AI Chat ]  [ Mentorship ]  [ Messages ]  [ Profile ]
```
Active tab: navy pill with white icon. Inactive: grey icon and label below.

---

## User Roles

### Legal Professional
Role value: `legal_professional`

Lawyers and law students share one dashboard.

- Chat starters: case summary, moot prep, legal principles, statute guides
- Mentorship tab: find a mentor, pupillage board, career events
- Can register as a lawyer to appear in the marketplace

### General User
Role value: `general_user`

Individuals, businesses, journalists, others.

- Chat starters: tenant rights, business registration, employment, family law
- Mentorship tab shows lawyer booking options
- Can browse and book verified lawyers

---

## Lawyer Marketplace Flow

```
General User: Mentorship tab
  → Browse Available Lawyers
    → Lawyer list (search + filter by specialty)
      → Tap card → Full profile
        → Book Consultation
          → Describe legal issue
            → Send Request
              → Lawyer receives notification
                → Lawyer accepts or declines via Messages tab
                  → User gets notified
```

Lawyer profile includes:
- Name, firm, NBA verification badge
- Specialties (color-coded tags)
- Location, years of experience, consultation rate
- Star rating and review count
- Biography
- WhatsApp direct contact
- Online indicator (green dot)
- Featured badge for boosted profiles

---

## Lawyer Registration

Legal professionals self-register to appear in the marketplace.

**Current status: FREE**

No payment is required during the early growth phase.

**Monetisation plan:**
- Free until 50-100 registered lawyers
- At that threshold, switch to paid listing (Paystack integration)
- Premium tier: featured placement at the top of search results, profile analytics, case win tracker

**Planned lawyer dashboard:**
- Total cases won and lost
- Client booking count
- Profile views and contact rate
- Review management
- Case outcome logging (the win tracker)
- Profile boost controls

---

## Document Actions

After the AI generates any document, 4 action buttons appear:

| Action | Behaviour |
|---|---|
| Save | Saves to My Documents |
| WhatsApp | Opens WhatsApp with the document text pre-loaded |
| Share | Opens the native OS share sheet (email, Telegram, Drive, etc.) |
| Print | Sends to phone printer or saves as PDF |

---

## Environment Variables

Set in `.env` for local development and in the EAS dashboard for cloud builds.

```
EXPO_PUBLIC_SUPABASE_URL=https://qcutjnsxiawnejiqwwix.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
EXPO_PUBLIC_API_URL=https://api.legalbridge.ng
```

Never commit `.env` to git. It is excluded by `.gitignore`.

---

## Running Locally

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your Android or iOS device.

---

## Building for Android

```bash
cd mobile

# Internal test APK (install directly on device)
eas build --profile mvp --platform android

# Production AAB (for Google Play Store)
eas build --profile production --platform android
```

Build artifacts are hosted on Expo servers. The build link is printed when the build completes.

---

## OTA Updates (No Reinstall Required)

After the initial APK is installed, code changes can be pushed over-the-air:

```bash
cd mobile
eas update --branch mvp --message "Fix: description of change"
```

The app checks for updates on launch and applies them automatically. No new APK install is needed for JavaScript and UI changes.

---

## EAS Project Details

- Account: aboyai
- Project: @aboyai/legalbridge
- Project ID: 5f6eb0b7-c724-4807-9b8e-1801a2dcc008
- Dashboard: https://expo.dev/accounts/aboyai/projects/legalbridge

---

## Supabase Details

- Project ref: qcutjnsxiawnejiqwwix
- Auth providers: Email/password, Google OAuth
- Edge Functions: chat-stream (AI chat), document generation

---

## Brand and Design

| Token | Value | Use |
|---|---|---|
| Primary | #1a3a6e | Navy blue: buttons, active states, headers |
| Accent | #f4c146 | Gold: logo Bridge italic, document tags, featured badges |
| Background | #f5f7fa | Light grey screen background |
| Surface | #ffffff | Cards, input bars, modals, drawer |
| Error | #e74c3c | Destructive actions, sign out |

Typography: System font (San Francisco on iOS, Roboto on Android).

Wordmark: "Legal" in regular weight + "Bridge" in italic gold.

---

## Roadmap

- [ ] Lawyer registration form and profile creation in-app
- [ ] Document Save, WhatsApp, Share, and Print actions
- [ ] Real-time booking flow: lawyer accept and decline
- [ ] Chat history persistence in Supabase
- [ ] My Documents synced with Supabase Storage
- [ ] Voice input via expo-speech-recognition
- [ ] File and image upload for document analysis
- [ ] Lawyer payment gateway via Paystack (activates at 50+ lawyers)
- [ ] Lawyer stats dashboard: wins, bookings, reviews
- [ ] Profile boost and featured listing controls
- [ ] iOS build and App Store submission
- [ ] Push notifications for booking confirmations and messages
- [ ] Research Tools: Nigerian case law search and statute browser
- [ ] Registrations and Compliance: CAC, FIRS, NAFDAC tracker

---

## Company

**DST Global Innovative Nigeria Ltd**

Building legal technology for Nigeria and Africa.

---

*For internal use only. Do not share API keys or credentials publicly.*
