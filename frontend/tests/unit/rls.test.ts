import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SA = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
async function asUser<T>(user: string, action: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user,
  ]);
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  db = new PGlite();
  // Only Supabase-managed auth/storage plumbing is substituted. The application
  // migrations and PostgreSQL RLS engine below are real, not mocked policy checks.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, storage to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  for (const file of [
    "202610110001_foundation.sql",
    "202610110002_storage.sql",
  ]) {
    await db.exec(
      readFileSync(resolve("../supabase/migrations", file), "utf8"),
    );
  }
  await db.query("insert into auth.users values ($1),($2)", [A, B]);
  await db.query(
    "insert into public.projects(id,owner_id,title) values ($1,$2,'A thesis'),($3,$4,'B thesis')",
    [PA, A, PB, B],
  );
  await db.query(
    "insert into public.sources(id,project_id,filename,storage_path,byte_size) values ($1,$2,'private.pdf',$3,100)",
    [SA, PA, A + "/" + PA + "/" + SA + ".pdf"],
  );
  await db.query(
    "insert into public.source_pages(project_id,source_id,page_number,text) values ($1,$2,1,'Private evidence')",
    [PA, SA],
  );
  await db.query(
    "insert into public.notes(project_id,title) values ($1,'Private note')",
    [PA],
  );
  await db.query(
    "insert into public.jobs(project_id,kind) values ($1,'ingestion')",
    [PA],
  );
  await db.query(
    "insert into public.sections(id,project_id,title) values ($1,$2,'A chapter')",
    [SA, PA],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("executed PostgreSQL ownership policies", () => {
  it("enables and forces RLS on every application table", async () => {
    const { rows } = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(rows.length).toBe(7);
    expect(
      rows.every((row) => row.relrowsecurity && row.relforcerowsecurity),
    ).toBe(true);
  });
  it("limits project reads to the authenticated owner", async () => {
    await asUser(A, async () =>
      expect(
        (await db.query("select title from public.projects")).rows,
      ).toEqual([{ title: "A thesis" }]),
    );
    await asUser(B, async () =>
      expect(
        (await db.query("select title from public.projects")).rows,
      ).toEqual([{ title: "B thesis" }]),
    );
  });
  it("allows owned creation but rejects forged ownership", async () => {
    await asUser(A, async () => {
      await db.query(
        "insert into public.projects(owner_id,title) values ($1,'New project')",
        [A],
      );
      await expect(
        db.query(
          "insert into public.projects(owner_id,title) values ($1,'Forged')",
          [B],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
  it("blocks foreign project updates and ownership transfer", async () => {
    await asUser(B, async () =>
      expect(
        (
          await db.query(
            "update public.projects set title='stolen' where id=$1 returning id",
            [PA],
          )
        ).rows,
      ).toEqual([]),
    );
    await asUser(
      A,
      async () =>
        await expect(
          db.query("update public.projects set owner_id=$1 where id=$2", [
            B,
            PA,
          ]),
        ).rejects.toThrow(/permission denied/i),
    );
  });
  it("rejects foreign section insert and cross-project parent links", async () => {
    await asUser(B, async () => {
      await expect(
        db.query(
          "insert into public.sections(project_id,title) values ($1,'Intrusion')",
          [PA],
        ),
      ).rejects.toThrow(/row-level security/i);
      await expect(
        db.query(
          "insert into public.sections(project_id,parent_id,title) values ($1,$2,'Foreign parent')",
          [PB, SA],
        ),
      ).rejects.toThrow(/foreign key/i);
      expect(
        (
          await db.query(
            "update public.sections set title='stolen' where project_id=$1 returning id",
            [PA],
          )
        ).rows,
      ).toEqual([]);
    });
  });
  it("protects sources, page text, notes and job state from another user", async () => {
    await asUser(B, async () => {
      for (const table of ["sources", "source_pages", "notes", "jobs"])
        expect((await db.query("select * from public." + table)).rows).toEqual(
          [],
        );
      await expect(
        db.query(
          "insert into public.notes(project_id,title) values ($1,'Injected note')",
          [PA],
        ),
      ).rejects.toThrow(/row-level security/i);
      await expect(
        db.query("update public.sources set status='ready'"),
      ).rejects.toThrow(/permission denied/i);
    });
  });
  it("does not expose data to anonymous requests", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.projects")).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await db.exec("reset role");
    }
  });
  it("allows only an owner to create and edit their profile", async () => {
    await asUser(A, async () => {
      await db.query(
        "insert into public.profiles(id,display_name) values ($1,'Student A')",
        [A],
      );
      await expect(
        db.query("insert into public.profiles(id) values ($1)", [B]),
      ).rejects.toThrow(/row-level security/i);
    });
    await asUser(B, async () =>
      expect((await db.query("select * from public.profiles")).rows).toEqual(
        [],
      ),
    );
  });
  it("requires a reserved owned source for storage uploads and private reads", async () => {
    const path = A + "/" + PA + "/" + SA + ".pdf";
    await asUser(A, async () => {
      await db.query(
        "insert into storage.objects(bucket_id,name) values ('sources',$1)",
        [path],
      );
      expect((await db.query("select name from storage.objects")).rows).toEqual(
        [{ name: path }],
      );
      await expect(
        db.query(
          "insert into storage.objects(bucket_id,name) values ('sources','unreserved.pdf')",
        ),
      ).rejects.toThrow(/row-level security/i);
    });
    await asUser(B, async () => {
      expect((await db.query("select * from storage.objects")).rows).toEqual(
        [],
      );
      await expect(
        db.query(
          "insert into storage.objects(bucket_id,name) values ('sources',$1)",
          [path],
        ),
      ).rejects.toThrow(/row-level security/i);
      expect(
        (
          await db.query(
            "update storage.objects set name='stolen' returning id",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (await db.query("delete from storage.objects returning id")).rows,
      ).toEqual([]);
    });
  });
  it("keeps assets and exports denied until their lifecycle is implemented", async () => {
    await asUser(A, async () => {
      for (const bucket of ["assets", "exports"])
        await expect(
          db.query(
            "insert into storage.objects(bucket_id,name) values ($1,'file')",
            [bucket],
          ),
        ).rejects.toThrow(/row-level security/i);
    });
  });
  it("hides tombstoned sources and projects including child records", async () => {
    await db.query("update public.sources set deleted_at=now() where id=$1", [
      SA,
    ]);
    await asUser(A, async () => {
      expect(
        (await db.query("select * from public.source_pages")).rows,
      ).toEqual([]);
      expect((await db.query("select * from storage.objects")).rows).toEqual(
        [],
      );
    });
    await db.query("update public.projects set deleted_at=now() where id=$1", [
      PA,
    ]);
    await asUser(A, async () => {
      expect(
        (
          await db.query("select * from public.sections where project_id=$1", [
            PA,
          ])
        ).rows,
      ).toEqual([]);
      await expect(
        db.query(
          "insert into public.sections(project_id,title) values ($1,'Resurrection')",
          [PA],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});
