# Caza Forms

Plataforma própria de formulários conversacionais (uma pergunta por tela) da Caza Millennium.

- **Stack:** Next.js 15 (App Router) + Supabase (Postgres, Auth, Storage, Edge Functions) + Vercel
- **Recursos:** builder com 13 tipos de pergunta, recall `{{variavel}}`, lógica condicional, quiz por soma ou categoria, várias telas finais, WhatsApp com mensagem pronta, upload de arquivos, UTMs e campos ocultos, respostas parciais, funil de abandono, CSV, webhook e e-mail.

## Variáveis de ambiente (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=https://kmgyfdfjqrneiqtfgeha.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

## Acesso
Somente e-mails cadastrados na tabela `admins` (tela **Equipe**) conseguem criar conta.

## E-mail de notificação
Configure o secret `RESEND_API_KEY` (e opcionalmente `RESEND_FROM`) na Edge Function `on-complete` do Supabase.
