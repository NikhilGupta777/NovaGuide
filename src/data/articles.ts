export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  categoryId: string;
  publishedAt: string;
  updatedAt: string;
  readTime: number;
  featured: boolean;
  tags: string[];
}

export const articles: Article[] = [
  {
    id: "1",
    title: "How to Free Up Storage on Your iPhone Without Deleting Apps",
    slug: "free-up-storage-iphone",
    excerpt: "Running out of storage on your iPhone? Learn quick tricks to reclaim space without removing your favorite apps.",
    content: `## The Problem

Your iPhone shows "Storage Almost Full" and you're not sure what to delete. Photos, messages, and cached data can silently eat up your storage.

## Step-by-Step Solution

### Step 1: Check What's Using Space

Go to **Settings → General → iPhone Storage**. Wait for the list to load. You'll see a breakdown of which apps and data types use the most space.

### Step 2: Clear Safari Cache

Open **Settings → Safari → Clear History and Website Data**. This can free up several hundred megabytes instantly.

### Step 3: Offload Unused Apps

In **Settings → General → iPhone Storage**, tap **Enable** next to "Offload Unused Apps." This removes app binaries but keeps your data, so you can reinstall anytime.

### Step 4: Review Large Attachments

Scroll down in iPhone Storage to see **Review Large Attachments**. Tap it and delete old videos, PDFs, and large images you no longer need.

### Step 5: Optimize Photos

Go to **Settings → Photos** and select **Optimize iPhone Storage**. Full-resolution photos will be stored in iCloud, while smaller versions stay on your device.

## Quick Recap

- Check storage usage in Settings
- Clear browser cache
- Offload unused apps
- Delete large attachments
- Optimize photo storage

These steps can easily free up 2–5 GB or more without losing any important apps.`,
    categoryId: "phone",
    publishedAt: "2026-02-05",
    updatedAt: "2026-02-05",
    readTime: 4,
    featured: true,
    tags: ["iPhone", "storage", "iOS", "tips"],
  },
  {
    id: "2",
    title: "Fix: WiFi Connected But No Internet on Windows 11",
    slug: "wifi-connected-no-internet-windows-11",
    excerpt: "Your Windows 11 PC says it's connected to WiFi, but web pages won't load. Here's how to fix it step by step.",
    content: `## The Problem

Windows 11 shows the WiFi icon as connected, but when you try to open a website, nothing loads. The status may say "No Internet Access."

## Step-by-Step Solution

### Step 1: Run the Network Troubleshooter

Right-click the WiFi icon in the taskbar and select **Troubleshoot problems**. Windows will attempt to diagnose and fix the issue automatically.

### Step 2: Flush DNS Cache

Open **Command Prompt as Administrator** (search "cmd", right-click, "Run as administrator"). Type the following commands:

\`\`\`
ipconfig /flushdns
ipconfig /release
ipconfig /renew
\`\`\`

### Step 3: Reset Network Settings

Go to **Settings → Network & Internet → Advanced network settings → Network reset**. Click **Reset now**. Your PC will restart.

### Step 4: Update Network Drivers

Open **Device Manager**, expand **Network adapters**, right-click your WiFi adapter, and select **Update driver → Search automatically**.

### Step 5: Try Google DNS

Go to **Settings → Network & Internet → WiFi → your network → DNS server assignment → Edit**. Set manual DNS to **8.8.8.8** and **8.8.4.4**.

## Quick Recap

- Run the built-in troubleshooter first
- Flush and renew your network settings
- Reset network if needed
- Update WiFi drivers
- Switch to Google DNS for reliability`,
    categoryId: "desktop",
    publishedAt: "2026-02-04",
    updatedAt: "2026-02-04",
    readTime: 5,
    featured: true,
    tags: ["Windows 11", "WiFi", "internet", "troubleshooting"],
  },
  {
    id: "3",
    title: "How to Download YouTube Videos for Offline Viewing",
    slug: "download-youtube-videos-offline",
    excerpt: "Want to watch YouTube videos without internet? Learn the official way to save videos for offline on any device.",
    content: `## The Problem

You want to watch YouTube videos during a flight, commute, or when you don't have internet access.

## Step-by-Step Solution

### Step 1: Get YouTube Premium (or use Free Downloads)

YouTube Premium lets you download any video. Some videos also offer free downloads in certain regions.

### Step 2: Open the YouTube App

Downloads only work in the **YouTube mobile app** (Android or iOS). You can't download from the web browser.

### Step 3: Find Your Video

Search for or navigate to the video you want to save.

### Step 4: Tap the Download Button

Below the video player, tap the **Download** button (arrow pointing down). Choose your preferred quality (720p recommended for balance of quality and size).

### Step 5: Access Downloads

Go to **Library → Downloads** in the YouTube app. Your saved videos are ready to watch offline.

## Quick Recap

- YouTube Premium enables offline downloads
- Use the YouTube mobile app
- Tap Download below any video
- Choose quality and save
- Find saved videos in Library → Downloads`,
    categoryId: "youtube",
    publishedAt: "2026-02-03",
    updatedAt: "2026-02-03",
    readTime: 3,
    featured: true,
    tags: ["YouTube", "download", "offline", "video"],
  },
  {
    id: "4",
    title: "How to Reset Your Instagram Password If You Forgot It",
    slug: "reset-instagram-password",
    excerpt: "Locked out of Instagram? Follow these steps to recover your account and reset your password quickly.",
    content: `## The Problem

You can't log into Instagram because you forgot your password, and you need to regain access to your account.

## Step-by-Step Solution

### Step 1: Go to the Login Screen

Open the Instagram app or go to instagram.com. On the login screen, tap **Forgot password?**

### Step 2: Enter Your Information

Type your **username**, **email address**, or **phone number** associated with your account.

### Step 3: Choose Recovery Method

Instagram will offer to send a reset link via **email** or **SMS**. Choose whichever you have access to.

### Step 4: Check Your Email or Messages

Open the email or text message from Instagram. Tap the **reset link** — it will open Instagram.

### Step 5: Create a New Password

Enter a new strong password. Use a mix of letters, numbers, and symbols. Tap **Reset Password** to confirm.

## Quick Recap

- Tap "Forgot password?" on login screen
- Enter your account email or phone
- Check email/SMS for reset link
- Create a strong new password
- Consider enabling two-factor auth afterwards`,
    categoryId: "social",
    publishedAt: "2026-02-02",
    updatedAt: "2026-02-02",
    readTime: 3,
    featured: false,
    tags: ["Instagram", "password", "recovery", "social media"],
  },
  {
    id: "5",
    title: "How to Convert a PDF to Word Document for Free",
    slug: "convert-pdf-to-word-free",
    excerpt: "Need to edit a PDF? Learn how to convert any PDF file to an editable Word document using free tools.",
    content: `## The Problem

You received a PDF file that you need to edit, but PDFs aren't directly editable like Word documents.

## Step-by-Step Solution

### Step 1: Use Google Docs (Free Method)

Go to **drive.google.com** and sign in. Upload your PDF file by dragging it into Drive.

### Step 2: Open with Google Docs

Right-click the uploaded PDF, select **Open with → Google Docs**. Google will convert it automatically.

### Step 3: Edit and Download

Make your edits in Google Docs. When done, go to **File → Download → Microsoft Word (.docx)**.

### Step 4: Alternative — Use Microsoft Word

If you have Word, go to **File → Open** and select your PDF. Word will convert it (some formatting may change).

### Step 5: Alternative — Online Converters

Visit **smallpdf.com** or **ilovepdf.com** for quick conversions. Upload, convert, and download.

## Quick Recap

- Google Docs offers free PDF to Word conversion
- Upload to Drive, open with Docs, download as .docx
- Microsoft Word can also open PDFs directly
- Online tools work for quick one-off conversions
- Always review formatting after conversion`,
    categoryId: "files",
    publishedAt: "2026-02-01",
    updatedAt: "2026-02-01",
    readTime: 3,
    featured: false,
    tags: ["PDF", "Word", "conversion", "free tools"],
  },
  {
    id: "6",
    title: "How to Set Up a New Android Phone: Complete Beginner's Guide",
    slug: "setup-new-android-phone",
    excerpt: "Just got a new Android phone? This complete guide walks you through the entire setup process from start to finish.",
    content: `## The Problem

You've just unboxed a new Android phone and want to set it up properly without missing any important steps.

## Step-by-Step Solution

### Step 1: Power On and Select Language

Press and hold the power button. Choose your language and region when prompted.

### Step 2: Connect to WiFi

Select your home WiFi network and enter the password. A stable connection is needed for setup.

### Step 3: Sign In with Google

Enter your Google account (Gmail). This connects your contacts, apps, and settings. If you don't have one, tap **Create account**.

### Step 4: Transfer Data (Optional)

If upgrading from another phone, use the cable or wireless transfer option to move your apps, photos, and data.

### Step 5: Set Up Security

Choose a screen lock method: **PIN**, **Pattern**, **Fingerprint**, or **Face Unlock**. Set up at least one biometric option.

### Step 6: Customize Basics

Set your default apps, wallpaper, and notification preferences. Enable **Find My Device** in Settings for security.

## Quick Recap

- Power on and connect to WiFi
- Sign in with your Google account
- Transfer data from old phone if needed
- Set up security (PIN + fingerprint)
- Customize your home screen and settings`,
    categoryId: "phone",
    publishedAt: "2026-01-30",
    updatedAt: "2026-01-30",
    readTime: 5,
    featured: false,
    tags: ["Android", "setup", "beginner", "new phone"],
  },
  {
    id: "7",
    title: "How to Take a Screenshot on Any Device",
    slug: "take-screenshot-any-device",
    excerpt: "Learn the screenshot shortcuts for iPhone, Android, Windows, Mac, and tablets — all in one place.",
    content: `## The Problem

You need to capture what's on your screen but don't know the right button combination for your device.

## Step-by-Step Solution

### iPhone (Face ID)
Press **Side Button + Volume Up** simultaneously. The screenshot saves to your Photos app.

### iPhone (Home Button)
Press **Home Button + Side Button** simultaneously.

### Android
Press **Power + Volume Down** at the same time. Some phones also support three-finger swipe down.

### Windows
Press **Windows + Shift + S** to open Snip & Sketch. Select the area you want to capture.

### Mac
Press **Command + Shift + 4** to select an area, or **Command + Shift + 3** for full screen.

### iPad
Press **Top Button + Volume Up** (no Home button) or **Top Button + Home Button** (older iPads).

## Quick Recap

- iPhone: Side + Volume Up
- Android: Power + Volume Down
- Windows: Win + Shift + S
- Mac: Cmd + Shift + 4
- Screenshots save to Photos or Desktop by default`,
    categoryId: "howto",
    publishedAt: "2026-01-28",
    updatedAt: "2026-01-28",
    readTime: 2,
    featured: true,
    tags: ["screenshot", "how-to", "all devices"],
  },
  {
    id: "8",
    title: "How to Clear Cache and Cookies on Google Chrome",
    slug: "clear-cache-cookies-chrome",
    excerpt: "Chrome running slow? Clearing cache and cookies can fix loading issues and free up space.",
    content: `## The Problem

Your Chrome browser is running slowly, pages aren't loading correctly, or you're seeing outdated content.

## Step-by-Step Solution

### Step 1: Open Chrome Settings

Click the **three dots** (⋮) in the top-right corner of Chrome. Select **Settings**.

### Step 2: Go to Privacy Settings

Click **Privacy and security** in the left sidebar. Then click **Clear browsing data**.

### Step 3: Choose Time Range

Select **All time** to clear everything, or choose a specific time range like "Last 7 days."

### Step 4: Select Data to Clear

Check the boxes for **Cookies and other site data** and **Cached images and files**. Uncheck "Browsing history" if you want to keep it.

### Step 5: Click Clear Data

Click the blue **Clear data** button. Chrome will remove the selected data. Note: you may need to sign in to websites again.

## Quick Recap

- Open Chrome Settings → Privacy and security
- Click Clear browsing data
- Select All time for thorough cleanup
- Check cookies and cache boxes
- Click Clear data — you're done!`,
    categoryId: "apps",
    publishedAt: "2026-01-27",
    updatedAt: "2026-01-27",
    readTime: 3,
    featured: false,
    tags: ["Chrome", "cache", "cookies", "browser"],
  },
  {
    id: "9",
    title: "How to Enable Two-Factor Authentication on Your Google Account",
    slug: "enable-2fa-google-account",
    excerpt: "Protect your Google account from hackers by setting up two-factor authentication in minutes.",
    content: `## The Problem

Your Google account contains emails, photos, and personal data. Without two-factor authentication, a stolen password could give someone full access.

## Step-by-Step Solution

### Step 1: Go to Google Security Settings

Visit **myaccount.google.com/security** or open the Google app → tap your profile → **Manage your Google Account** → **Security**.

### Step 2: Find 2-Step Verification

Scroll to the "Signing in to Google" section. Click **2-Step Verification** → **Get started**.

### Step 3: Verify Your Identity

Enter your Google password to confirm it's you.

### Step 4: Choose Verification Method

Select your preferred method:
- **Google prompts** (recommended) — tap Yes/No on your phone
- **Text message** — receive a code via SMS
- **Authenticator app** — use Google Authenticator or similar

### Step 5: Set Up Backup Options

Add a backup phone number and download **backup codes**. Store these codes in a safe place in case you lose your phone.

## Quick Recap

- Go to Google Security settings
- Enable 2-Step Verification
- Choose Google prompts for easiest setup
- Add backup phone number
- Save backup codes securely`,
    categoryId: "account",
    publishedAt: "2026-01-25",
    updatedAt: "2026-01-25",
    readTime: 4,
    featured: false,
    tags: ["Google", "2FA", "security", "account"],
  },
  {
    id: "10",
    title: "How to Use Split Screen on iPad for Multitasking",
    slug: "split-screen-ipad-multitasking",
    excerpt: "Learn how to run two apps side by side on your iPad to boost your productivity.",
    content: `## The Problem

You want to use two apps at the same time on your iPad — for example, taking notes while watching a video.

## Step-by-Step Solution

### Step 1: Open Your First App

Launch the first app you want to use. For example, open Safari.

### Step 2: Access the Multitasking Menu

Tap the **three dots** (•••) at the top center of the screen. You'll see three options: Full Screen, Split View, and Slide Over.

### Step 3: Choose Split View

Tap the **Split View** button (two rectangles side by side). Your current app will move to one side.

### Step 4: Select Second App

Your Home Screen appears. Tap the second app you want to open. It will fill the other half of the screen.

### Step 5: Adjust the Split

Drag the **center divider** left or right to give more space to either app. You can have a 50/50 or 70/30 split.

## Quick Recap

- Open the first app
- Tap the three dots at the top
- Choose Split View
- Select your second app
- Drag the divider to adjust sizes`,
    categoryId: "tablet",
    publishedAt: "2026-01-24",
    updatedAt: "2026-01-24",
    readTime: 3,
    featured: false,
    tags: ["iPad", "split screen", "multitasking", "productivity"],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getArticlesByCategory(categoryId: string): Article[] {
  return articles.filter((a) => a.categoryId === categoryId);
}

export function getFeaturedArticles(): Article[] {
  return articles.filter((a) => a.featured);
}

export function searchArticles(query: string): Article[] {
  const q = query.toLowerCase();
  return articles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.excerpt.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
  );
}
