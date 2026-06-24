import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AppAuthGuard } from "./common/app-auth.guard";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { HealthModule } from "./health/health.module";
import { ContactsModule } from "./contacts/contacts.module";
import { DealsModule } from "./deals/deals.module";
import { PipelinesModule } from "./pipelines/pipelines.module";
import { TagsModule } from "./tags/tags.module";
import { ActivitiesModule } from "./activities/activities.module";
import { CustomFieldsModule } from "./custom-fields/custom-fields.module";
import { QuickRepliesModule } from "./quick-replies/quick-replies.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AdminModule } from "./admin/admin.module";
import { SettingsModule } from "./settings/settings.module";
import { InboxModule } from "./inbox/inbox.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { WhatsappConnectionsModule } from "./whatsapp-connections/whatsapp-connections.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { TenantsModule } from "./tenants/tenants.module";
import { ProspectingModule } from "./prospecting/prospecting.module";
import { PipelineAutomationsModule } from "./pipeline-automations/pipeline-automations.module";
import { ProductsModule } from "./products/products.module";
import { ProspectListsModule } from "./prospect-lists/prospect-lists.module";
import { OutreachModule } from "./outreach/outreach.module";
import { GoogleCalendarModule } from "./google-calendar/google-calendar.module";
import { ReportsModule } from "./reports/reports.module";
import { LeadScoringModule } from "./lead-scoring/lead-scoring.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 300 },
    ]),
    PrismaModule,
    WorkspacesModule,
    AuthModule,
    HealthModule,
    ContactsModule,
    DealsModule,
    PipelinesModule,
    TagsModule,
    ActivitiesModule,
    CustomFieldsModule,
    QuickRepliesModule,
    DashboardModule,
    AnalyticsModule,
    AdminModule,
    SettingsModule,
    InboxModule,
    ConversationsModule,
    WhatsappConnectionsModule,
    WebhooksModule,
    TenantsModule,
    ProspectingModule,
    PipelineAutomationsModule,
    ProductsModule,
    ProspectListsModule,
    OutreachModule,
    GoogleCalendarModule,
    ReportsModule,
    LeadScoringModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AppAuthGuard },
  ],
})
export class AppModule {}
