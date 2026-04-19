import { Elysia, t } from "elysia";

import type { BindingAdminServicePort } from "../application/services/binding-admin-service.ts";
import type { NotificationServicePort } from "../application/services/notification-service.ts";

const textNotificationSchema = t.Object({
  type: t.Literal("text"),
  targets: t.Optional(t.Array(t.String({ minLength: 1 }))),
  text: t.String({ minLength: 1 })
});

const imageNotificationSchema = t.Object({
  type: t.Literal("image"),
  targets: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
  imageUrl: t.String({ minLength: 1, format: "uri" }),
  caption: t.Optional(t.String({ minLength: 1 }))
});

const targetSchema = t.Object({
  alias: t.String({ minLength: 1 }),
  userId: t.String({ minLength: 1 }),
  contextToken: t.String({ minLength: 1 })
});

type CreateAppOptions = {
  notificationService: NotificationServicePort;
  adminService: BindingAdminServicePort;
  notificationApiToken: string | undefined;
  adminApiToken: string | undefined;
};

export function createApp({
  notificationService,
  adminService,
  notificationApiToken,
  adminApiToken
}: CreateAppOptions) {
  return new Elysia()
    .get("/health", () => ({
      status: "ok"
    }))
    .post(
      "/wechatBot/letletme/notification",
      async ({ body, headers, set }) => {
        if (notificationApiToken && !isAuthorized(headers.authorization, notificationApiToken)) {
          set.status = 401;
          return unauthorizedResponse();
        }

        return notificationService.send({
          ...body,
          targets: body.targets ?? []
        });
      },
      {
        body: t.Union([textNotificationSchema, imageNotificationSchema])
      }
    )
    .get("/wechatBot/letletme/admin/state", async ({ headers, set }) => {
      if (adminApiToken && !isAuthorized(headers.authorization, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      return adminService.getState();
    })
    .post("/wechatBot/letletme/admin/binding/qrcode", async ({ headers, set }) => {
      if (adminApiToken && !isAuthorized(headers.authorization, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      return adminService.createQrCode();
    })
    .post("/wechatBot/letletme/admin/binding/poll", async ({ headers, set }) => {
      if (adminApiToken && !isAuthorized(headers.authorization, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      return adminService.pollQrStatus();
    })
    .post(
      "/wechatBot/letletme/admin/targets",
      async ({ body, headers, set }) => {
        if (adminApiToken && !isAuthorized(headers.authorization, adminApiToken)) {
          set.status = 401;
          return unauthorizedResponse();
        }

        return adminService.upsertTarget(body);
      },
      {
        body: targetSchema
      }
    )
    .delete("/wechatBot/letletme/admin/targets/:alias", async ({ params, headers, set }) => {
      if (adminApiToken && !isAuthorized(headers.authorization, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      return adminService.removeTarget(params.alias);
    })
    .post("/wechatBot/letletme/admin/binding/reset", async ({ headers, set }) => {
      if (adminApiToken && !isAuthorized(headers.authorization, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      return adminService.resetBinding();
    });
}

function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  if (!header) {
    return false;
  }

  return header === `Bearer ${expectedToken}`;
}

function unauthorizedResponse() {
  return {
    code: "unauthorized",
    message: "Missing or invalid bearer token."
  };
}
