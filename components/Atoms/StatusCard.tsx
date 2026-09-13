import { Card, CardContent } from "@/components/ui/card"
import { Network, Wifi, Gauge, Activity, GalleryHorizontalEnd } from "lucide-react"

export function StatusCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="p-4">
        <div className="grid items-start gap-4">
          <div className="text-sm flex items-start md:items-center gap-4 p-4 border rounded-lg">
            <div className="bg-muted rounded-md flex items-center justify-center aspect-square w-10 md:w-12">
              <Network className="w-5 h-5" />
            </div>
            <div className="grid gap-1">
              <div>
                <span className="font-medium">Status</span>: Connected
              </div>
              <div className="text-xs text-muted-foreground">You are connected to the internet.</div>
            </div>
          </div>
          <div className="text-sm flex items-start md:items-center gap-4 p-4 rounded-lg">
            <div className="bg-muted rounded-md flex items-center justify-center aspect-square w-10 md:w-12">
              <Wifi className="w-5 h-5" />
            </div>
            <div className="grid gap-1">
              <div>
                <span className="font-medium">Connectivity</span>: Wi-Fi
              </div>
              <div className="text-xs text-muted-foreground">Your internet connection is stable.</div>
            </div>
          </div>
          <div className="text-sm flex items-start md:items-center gap-4 p-4 rounded-lg">
            <div className="bg-muted rounded-md flex items-center justify-center aspect-square w-10 md:w-12">
              <Gauge className="w-5 h-5" />
            </div>
            <div className="grid gap-1">
              <div>
                <span className="font-medium">Latency</span>: High
              </div>
              <div className="text-xs text-muted-foreground">We are experiencing some delays.</div>
            </div>
          </div>
          <div className="text-sm flex items-start md:items-center gap-4 p-4 rounded-lg">
            <div className="bg-muted rounded-md flex items-center justify-center aspect-square w-10 md:w-12">
              <Activity className="w-5 h-5" />
            </div>
            <div className="grid gap-1">
              <div>
                <span className="font-medium">Throughput</span>: Reduced
              </div>
              <div className="text-xs text-muted-foreground">Your connection speed is slower than usual.</div>
            </div>
          </div>
          <div className="text-sm flex items-start md:items-center gap-4 p-4 rounded-lg">
            <div className="bg-muted rounded-md flex items-center justify-center aspect-square w-10 md:w-12">
              <GalleryHorizontalEnd className="w-5 h-5" />
            </div>
            <div className="grid gap-1">
              <div>
                <span className="font-medium">Packet Loss</span>: Increased
              </div>
              <div className="text-xs text-muted-foreground">Some data is not reaching its destination.</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
