// Chạy supabase/schema.sql lên database Supabase.
// Dùng: npm run db:setup  (đọc SUPABASE_DB_URL từ .env.local)
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url || url.includes("[YOUR-PASSWORD]")) {
  console.error("Thiếu SUPABASE_DB_URL trong .env.local (Dashboard → Connect → Connection string).");
  process.exit(1);
}

// Direct connection (db.<ref>.supabase.co) chỉ có IPv6. Nhiều mạng không có IPv6,
// nên đổi sang Session pooler (IPv4) bằng cách thử lần lượt các region.
const REGIONS = [
  "ap-southeast-1", "ap-northeast-1", "ap-northeast-2", "ap-southeast-2", "ap-south-1",
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "sa-east-1",
  "eu-central-1", "eu-central-2", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1",
];

function candidates(raw) {
  const u = new URL(raw);
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (!m) return [raw];
  const ref = m[1];
  const list = [];
  for (const region of REGIONS) {
    for (const prefix of ["aws-0", "aws-1"]) {
      const p = new URL(raw);
      p.hostname = `${prefix}-${region}.pooler.supabase.com`;
      p.port = "5432";
      p.username = `postgres.${ref}`;
      list.push(p.toString());
    }
  }
  return list;
}

async function connect() {
  const list = candidates(url);
  if (list.length > 1) console.log("Direct connection chỉ có IPv6 → đang dò Session pooler...");
  for (const connectionString of list) {
    const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      if (list.length > 1) {
        const safe = connectionString.replace(/:[^:@/]+@/, ":****@");
        console.log(`✓ Kết nối qua ${safe}\n  (nên thay SUPABASE_DB_URL bằng URL này)`);
      }
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      const wrongRegion = /tenant(\/| or )user.*not found/i.test(err.message) || err.code === "ENOTFOUND";
      if (list.length === 1 || !wrongRegion) throw err;
    }
  }
  throw new Error("Không tìm được Session pooler. Hãy copy URL Session pooler từ Dashboard → Connect.");
}

// Tạo (hoặc đổi mật khẩu) tài khoản root trong Supabase Auth và đánh dấu nó là root duy nhất.
// Ghi thẳng vào auth.users bằng quyền postgres nên user được xác nhận email luôn, không cần gửi mail.
// Các cột token để chuỗi rỗng vì Supabase Auth báo lỗi khi gặp NULL ở đó.
async function setupRoot(client, email, password) {
  await client.query("begin");
  try {
    let { rows } = await client.query("select id from auth.users where lower(email) = lower($1)", [email]);
    let id = rows[0]?.id;
    if (id) {
      await client.query(
        `update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
         where id = $1`,
        [id, password],
      );
    } else {
      ({ rows } = await client.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change, email_change_token_new)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           lower($1), extensions.crypt($2, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
         returning id`,
        [email, password],
      ));
      id = rows[0].id;
      await client.query(
        `insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, $3::text, 'email',
           jsonb_build_object('sub', $3::text, 'email', lower($2::text), 'email_verified', true), now(), now(), now())`,
        [id, email, String(id)],
      );
    }
    // Các phiên bản Supabase Auth khác nhau có thêm cột token khác; cột nào tồn tại mà đang NULL thì điền ''
    const { rows: cols } = await client.query(
      `select column_name from information_schema.columns
       where table_schema = 'auth' and table_name = 'users' and data_type in ('text', 'character varying')
         and column_name in ('confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
           'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')`,
    );
    if (cols.length) {
      const set = cols.map((c) => `"${c.column_name}" = coalesce("${c.column_name}", '')`).join(", ");
      await client.query(`update auth.users set ${set} where id = $1`, [id]);
    }
    await client.query(
      `insert into public.root_account (singleton, user_id) values (true, $1)
       on conflict (singleton) do update set user_id = excluded.user_id`,
      [id],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const rootEmail = process.env.ROOT_EMAIL?.trim();
const rootPassword = process.env.ROOT_PASSWORD;
let client;
try {
  client = await connect();
  await client.query(sql);
  const { rows } = await client.query("select count(*)::int as n from public.books");
  console.log(`✓ Đã chạy schema.sql — bảng books có ${rows[0].n} dòng, bucket "books" sẵn sàng.`);

  if (rootEmail && rootPassword) {
    if (rootPassword.length < 8) throw new Error("ROOT_PASSWORD phải có ít nhất 8 ký tự.");
    await setupRoot(client, rootEmail, rootPassword);
    console.log(`✓ Tài khoản root: ${rootEmail} (đã đặt mật khẩu theo ROOT_PASSWORD)`);
  } else {
    const { rows: root } = await client.query(
      "select u.email from public.root_account r join auth.users u on u.id = r.user_id",
    );
    if (root[0]) console.log(`• Tài khoản root hiện tại: ${root[0].email}`);
    else console.log("! Chưa có tài khoản root. Điền ROOT_EMAIL và ROOT_PASSWORD trong .env.local rồi chạy lại.");
  }
} catch (err) {
  console.error("✗ Lỗi khi chạy schema:", err.message);
  process.exitCode = 1;
} finally {
  await client?.end();
}
