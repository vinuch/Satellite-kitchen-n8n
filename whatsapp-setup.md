# WhatsApp Setup Guide for Satellite Kitchen

This guide walks you through setting up WhatsApp notifications for the n8n workflow.

## Recommended Provider: Twilio WhatsApp API

We recommend **Twilio** for WhatsApp notifications because:
- Easy setup and reliable delivery
- Works with sandbox for testing
- Good documentation and support
- Pay-as-you-go pricing

---

## Step 1: Sign Up for Twilio

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Create a free account
3. Verify your phone number
4. Complete the onboarding

---

## Step 2: Get Your Twilio Credentials

1. From the Twilio Console Dashboard, find:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click "Show" to reveal)

2. Copy these to your `.env` file:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   ```

---

## Step 3: Set Up WhatsApp Sandbox

1. In Twilio Console, go to **Messaging** → **Try it out** → **Send a WhatsApp message**
2. You'll see a WhatsApp sandbox number (e.g., `+1 415 523 8886`)
3. Copy this number to your `.env`:
   ```
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   ```

4. **Important**: You must join the sandbox by sending a WhatsApp message FROM your phone TO the sandbox number with the join code shown in Twilio.

---

## Step 4: Add Chef and Manager Numbers

Both the chef and manager need to join the WhatsApp sandbox:

1. Have them send a WhatsApp message to the Twilio sandbox number with the join code
2. Add their numbers to `.env`:
   ```
   CHEF_PHONE=+2348012345678
   MANAGER_PHONE=+2348098765432
   ```

**Note**: Numbers must be in international format with `+` prefix.

---

## Step 5: Update n8n Credentials

1. In n8n, go to **Settings** → **Credentials**
2. Create a new HTTP Request credential:
   - **Name**: Twilio WhatsApp
   - **Authentication**: Generic Credential Type
   - **Generic Auth Type**: Basic Auth
   - **User**: Your Twilio Account SID
   - **Password**: Your Twilio Auth Token

3. Update the workflow nodes to use this credential

---

## Step 6: Test the Setup

1. Run the `chowdeck-poller-workflow` manually in n8n
2. Check the execution logs for the WhatsApp node
3. Verify the chef receives the message

---

## Alternative: Meta WhatsApp Business API

If you prefer using Meta's official API:

### Requirements:
- Facebook Business Account
- WhatsApp Business Account
- Verified business (for production)

### Setup Steps:
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app with WhatsApp product
3. Get your **Access Token** and **Phone Number ID**
4. Update `.env` with Meta credentials (see commented section)

### Pros:
- Official WhatsApp API
- No sandbox restrictions in production
- Can use your own business number

### Cons:
- More complex setup
- Requires business verification
- Higher costs for high volume

---

## Troubleshooting

### Messages Not Sending
1. Check Twilio logs in the console
2. Verify the sandbox join code was sent
3. Confirm phone numbers are in international format
4. Check n8n execution logs for errors

### Rate Limits
- Twilio sandbox: 1 message per second
- Production: Higher limits available

### Costs
- Twilio WhatsApp: ~$0.005-0.01 per message (varies by country)
- Meta API: Conversation-based pricing

---

## Security Notes

- Never commit `.env` with real credentials to git
- Rotate API keys periodically
- Use n8n's credential encryption for production
- Monitor Twilio usage to prevent unexpected charges

---

## Database Schema Update

Ensure your `orders` table has the `chef_notified_at` column:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chef_notified_at TIMESTAMP WITH TIME ZONE;
```

The workflow will automatically update this timestamp when a WhatsApp notification is successfully sent.
