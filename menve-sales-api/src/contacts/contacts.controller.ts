import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ContactsService } from "./contacts.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(@ReqUser() u: RequestUser) {
    return this.contacts.list(u.tenantId);
  }

  @Get("for-pipeline")
  forPipeline(@ReqUser() u: RequestUser) {
    return this.contacts.listForPipeline(u.tenantId);
  }

  @Get("export/csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportCsv(@ReqUser() u: RequestUser, @Res() res: Response) {
    const csv = await this.contacts.exportCsv(u.tenantId);
    res.send(csv);
  }

  @Post("import/csv")
  importCsv(@ReqUser() u: RequestUser, @Body() body: { text?: string }) {
    return this.contacts.importCsv(u.tenantId, body.text ?? "");
  }

  @Get("campaign-sources")
  campaignSources(@ReqUser() u: RequestUser) {
    return this.contacts.listCampaignSources(u.tenantId);
  }

  @Get(":id")
  getOne(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.contacts.getDetail(u.tenantId, id);
  }

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.contacts.create(u.tenantId, body);
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.contacts.delete(u.tenantId, id);
  }

  @Patch(":id/custom-data")
  patchCustomData(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: { values?: Record<string, unknown> },
  ) {
    return this.contacts.updateCustomData(
      u.tenantId,
      id,
      body.values ?? {},
    );
  }

  @Patch(":id")
  patchContact(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.contacts.patch(u.tenantId, id, body);
  }

  @Post(":id/tags/:tagId")
  addTag(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Param("tagId") tagId: string,
  ) {
    return this.contacts.addTag(u.tenantId, id, tagId);
  }

  @Delete(":id/tags/:tagId")
  removeTag(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Param("tagId") tagId: string,
  ) {
    return this.contacts.removeTag(u.tenantId, id, tagId);
  }
}
