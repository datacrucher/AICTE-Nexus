-- LOCAL VALIDATION: run after migrations and seed.sql. Raises an exception on the first failed expectation.
create schema tests; grant usage on schema tests to authenticated, anon;
create function tests.eq(label text, got text, want text) returns void language plpgsql as $$ begin if got is distinct from want then raise exception 'FAIL: % (got %, want %)', label, got, want; end if; raise notice 'ok   %', label; end $$;
create function tests.ok(label text, q text) returns void language plpgsql as $$ begin execute q; raise notice 'ok   %', label; exception when others then raise exception 'FAIL: % raised: %', label, sqlerrm; end $$;
create function tests.denied(label text, q text) returns void language plpgsql as $$ begin begin execute q; exception when others then raise notice 'ok   % (blocked: %)', label, sqlerrm; return; end; raise exception 'FAIL: % was NOT blocked', label; end $$;
create function tests.rows(label text, q text, want int) returns void language plpgsql as $$ declare n int; begin execute q; get diagnostics n = row_count; if n <> want then raise exception 'FAIL: % affected % rows, want %', label, n, want; end if; raise notice 'ok   % (rows=%)', label, n; end $$;
create function tests.denied_like(label text, q text, pat text) returns void language plpgsql as $$ begin begin execute q; exception when others then if sqlerrm like pat then raise notice 'ok   % (blocked: %)', label, sqlerrm; return; end if; raise exception 'FAIL: % blocked for the wrong reason: %', label, sqlerrm; end; raise exception 'FAIL: % was NOT blocked', label; end $$;
grant execute on all functions in schema tests to authenticated, anon;
\set ON_ERROR_STOP on
