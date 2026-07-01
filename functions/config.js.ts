interface Env {
  PUBLIC_MATHWAR_SERVER_URL?: string;
}

interface ConfigRequestContext {
  env: Env;
}

export const onRequestGet = async (context: ConfigRequestContext): Promise<Response> => {
  const serverUrl = context.env.PUBLIC_MATHWAR_SERVER_URL ?? '';

  const config = JSON.stringify({ serverUrl }).replaceAll('<', '\\u003c');

  return new Response(`window.MATH_WAR_CONFIG = ${config};\n`, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};