import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const args = parseArgs(process.argv.slice(2))
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const userId = args['user-id'] || process.env.SIMULATION_USER_ID
const userEmail = args.email || process.env.SIMULATION_USER_EMAIL

if (!url || !serviceRoleKey) {
  fail('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.')
}

if (!userId && !userEmail) {
  fail('Indica --user-id o --email (tambien SIMULATION_USER_ID/SIMULATION_USER_EMAIL).')
}

const phone = args.phone || process.env.SIMULATION_PHONE || '+15550001111'
const contactName = args.name || process.env.SIMULATION_NAME || 'Cliente de prueba'
const delayMs = Number(args.delay || 0)
const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const profileQuery = supabase
  .from('profiles')
  .select('user_id, account_id, email')
  .limit(1)

const { data: profiles, error: profileError } = userId
  ? await profileQuery.eq('user_id', userId)
  : await profileQuery.eq('email', userEmail)

if (profileError) fail(`No se pudo buscar el perfil: ${profileError.message}`)
const profile = profiles?.[0]
if (!profile) fail('No encontre un perfil para el usuario indicado.')

const normalizedPhone = phone.replace(/[^0-9]/g, '')
const { data: existingContact, error: contactLookupError } = await supabase
  .from('contacts')
  .select('id, name, phone')
  .eq('account_id', profile.account_id)
  .eq('phone_normalized', normalizedPhone)
  .maybeSingle()

if (contactLookupError) fail(`No se pudo buscar el contacto: ${contactLookupError.message}`)

let contact = existingContact
if (!contact) {
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: profile.user_id,
      account_id: profile.account_id,
      phone,
      name: contactName,
      origen: "meta"
    })
    .select('id, name, phone')
    .single()

  if (error) fail(`No se pudo crear el contacto: ${error.message}`)
  contact = data
}

const { data: existingConversation, error: conversationLookupError } = await supabase
  .from('conversations')
  .select('id')
  .eq('account_id', profile.account_id)
  .eq('contact_id', contact.id)
  .maybeSingle()

if (conversationLookupError) {
  fail(`No se pudo buscar la conversacion: ${conversationLookupError.message}`)
}

if (existingConversation && args.reset) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', existingConversation.id)

  if (error) fail(`No se pudo reiniciar la conversacion: ${error.message}`)
}

let conversation = existingConversation && !args.reset ? existingConversation : null
if (!conversation) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: profile.user_id,
      account_id: profile.account_id,
      contact_id: contact.id,
      status: 'open',
      unread_count: 0,
    })
    .select('id')
    .single()

  if (error) fail(`No se pudo crear la conversacion: ${error.message}`)
  conversation = data
}

const turns = [
  ['customer', 'Hola, quisiera informacion sobre sus servicios.'],
  ['agent', 'Hola. Claro, con gusto te ayudo. Que servicio te interesa?'],
  ['customer', 'Me interesa el plan profesional y saber cuanto cuesta.'],
  ['agent', 'El plan profesional cuesta 49 USD al mes e incluye soporte prioritario.'],
  ['customer', 'Perfecto. Me gustaria agendar una demostracion.'],
]

const baseTime = Date.now() - (turns.length - 1) * 60000
const messages = turns.map(([senderType, text], index) => ({
  conversation_id: conversation.id,
  sender_type: senderType,
  sender_id: senderType === 'agent' ? profile.user_id : null,
  content_type: 'text',
  content_text: text,
  message_id: `simulation-${randomUUID()}`,
  status: 'sent',
  created_at: new Date(baseTime + index * 60000).toISOString(),
}))

if (delayMs > 0) {
  for (const message of messages) {
    await insertMessage(message)
    await wait(delayMs)
  }
} else {
  const { error } = await supabase.from('messages').insert(messages)
  if (error) fail(`No se pudieron insertar los mensajes: ${error.message}`)
}

const lastMessage = messages.at(-1)
const customerMessages = messages.filter(({ sender_type }) => sender_type === 'customer').length
const { error: conversationUpdateError } = await supabase
  .from('conversations')
  .update({
    last_message_text: lastMessage.content_text,
    last_message_at: lastMessage.created_at,
    updated_at: new Date().toISOString(),
    unread_count: customerMessages,
    status: 'open',
  })
  .eq('id', conversation.id)

if (conversationUpdateError) {
  fail(`No se pudo actualizar la conversacion: ${conversationUpdateError.message}`)
}

console.log(`Simulacion creada para ${contact.name || contact.phone}.`)
console.log(`Contacto: ${contact.id}`)
console.log(`Conversacion: ${conversation.id}`)
console.log(`Mensajes insertados: ${messages.length}`)
console.log('No se realizo ninguna llamada a Meta/WhatsApp.')

async function insertMessage(message) {
  const { error } = await supabase.from('messages').insert(message)
  if (error) fail(`No se pudo insertar un mensaje: ${error.message}`)
}

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) continue
    const [key, inlineValue] = argument.slice(2).split('=', 2)
    parsed[key] = inlineValue ?? argv[index + 1] ?? true
    if (inlineValue === undefined && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      index += 1
    }
  }
  return parsed
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}
