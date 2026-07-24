import { formatSyncTime, getSiteData } from "@/lib/site-data";
import HomeClient from "@/components/HomeClient";

export default function HomePage() {
  const data = getSiteData();
  return (
    <HomeClient
      main={data.main}
      game={data.game}
      programmer={data.programmer}
      contentSyncedAt={formatSyncTime(data.meta.contentSyncedAt)}
      statsSyncedAt={formatSyncTime(data.meta.statsSyncedAt)}
    />
  );
}
