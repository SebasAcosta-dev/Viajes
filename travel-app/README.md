This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Confirmación de correo de Supabase Auth

El registro envía `emailRedirectTo` a `/auth/callback`. La ruta intercambia el código PKCE por una sesión en cookies y devuelve al usuario a `/cuenta`. También acepta enlaces con `token_hash` para plantillas de correo que usen ese formato. Los errores de confirmación se muestran de forma genérica; la aplicación no puede afirmar que Supabase haya entregado un mensaje.

Antes de probar registro y confirmación en un proyecto, configura en Supabase **Authentication → URL Configuration**:

- **Site URL**: el dominio canónico HTTPS de producción.
- **Redirect URLs**: el callback de producción, `http://localhost:3000/auth/callback` y los callbacks de los previews de Vercel que se quieran permitir. Para previews, limita el comodín al dominio de equipo/proyecto de Vercel.
- Revisa que la plantilla de confirmación preserve la URL de retorno solicitada. Si la plantilla se personaliza para `token_hash`, el enlace debe apuntar al callback de la aplicación con `token_hash={{ .TokenHash }}&type=email` y conservar el destino indicado por Supabase.

En Vercel, define `NEXT_PUBLIC_SITE_URL` como el origen HTTPS canónico de producción (sin ruta). Los registros locales usan el origen local actual y los previews usan su URL de despliegue. Cambiar variables requiere una nueva compilación/despliegue para que lleguen al cliente.

Si el correo no llega, revisa **Authentication → Logs** para distinguir errores al crear/enviar la solicitud de problemas posteriores de entrega. El SMTP predeterminado de Supabase tiene límites y destinatarios permitidos; configura un SMTP propio para un servicio de producción si los registros lo requieren. No concluyas que el usuario se creó ni que el mensaje llegó basándote solo en la respuesta del navegador.
