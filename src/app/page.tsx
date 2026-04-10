import Link from 'next/link';
import { 
  Trophy, 
  TrendingUp, 
  Eye, 
  ExternalLink, 
  Users, 
  PlusCircle, 
  Flame 
} from 'lucide-react';
import { prisma } from "@/lib/prisma";

// This runs on the server (React Server Component)
async function getChannels() {
  try {
    return await prisma.channel.findMany({
      orderBy: { subscriberCount: 'desc' },
    });
  } catch (e) {
    console.error("No Database configured yet.", e);
    // Return mock data so the layout works before DB is really set up
    return [
      { id: '1', name: 'Cytrena', url: 'https://youtube.com/@Cytrena', subscriberCount: 154200, totalViews: 4500000 },
      { id: '2', name: 'qrmoe', url: 'https://youtube.com/@qrmoe', subscriberCount: 120500, totalViews: 3200000 },
      { id: '3', name: 'AnitorMusic', url: 'https://youtube.com/@AnitorMusic', subscriberCount: 88400, totalViews: 1900000 },
      { id: '4', name: 'Pearitto', url: 'https://youtube.com/@Pearitto', subscriberCount: 45000, totalViews: 1200000 },
      { id: '5', name: 'HugeBoiMusic', url: 'https://youtube.com/@HugeBoiMusic', subscriberCount: 42100, totalViews: 900500 },
      { id: '6', name: 'LymonaMusic', url: 'https://youtube.com/@LymonaMusic', subscriberCount: 31000, totalViews: 750000 },
      { id: '7', name: 'serum.artist', url: 'https://youtube.com/@serum.artist', subscriberCount: 28000, totalViews: 400000 },
      { id: '8', name: 'djfku', url: 'https://youtube.com/@djfku', subscriberCount: 12000, totalViews: 100000 },
      { id: '9', name: 'MXZIOFC', url: 'https://youtube.com/@MXZIOFC', subscriberCount: 5000, totalViews: 80000 },
      { id: '10', name: 'ATLXS_MUSIC', url: 'https://youtube.com/@ATLXS_MUSIC', subscriberCount: 2500, totalViews: 30000 },
    ];
  }
}

export default async function LeaderboardPage() {
  const channels = await getChannels();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans overflow-hidden relative">
      
      {/* Decorative Grid */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      <div className="max-w-5xl mx-auto relative z-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 border-b border-[var(--muted)] pb-8">
          <div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase flex items-center gap-4 text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-400 to-[#c026d3]">
              <Flame className="w-10 h-10 md:w-14 md:h-14 text-[var(--accent)]" />
              Phonk Ranks
            </h1>
            <p className="text-[var(--muted-foreground)] mt-2 text-lg font-medium max-w-xl">
              The ultimate Funk/Phonk YouTube channel leaderboard. Submit your channel, climb the ranks, own the algorithm.
            </p>
          </div>
          <button className="whitespace-nowrap px-6 py-3 rounded-full font-bold bg-[var(--accent)] hover:bg-[#a21caf] transition-all flex items-center gap-2 shadow-[0_0_20px_var(--accent-glow)] text-white">
            <PlusCircle className="w-5 h-5" />
            Add Channel
          </button>
        </header>

        {/* Stats Summary Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg">
            <Trophy className="w-8 h-8 text-yellow-400 mb-3" />
            <span className="text-[var(--muted-foreground)] text-sm font-semibold uppercase tracking-wider">Top Artist</span>
            <strong className="text-2xl font-black mt-1">Cytrena</strong>
          </div>
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg">
            <Users className="w-8 h-8 text-blue-400 mb-3" />
            <span className="text-[var(--muted-foreground)] text-sm font-semibold uppercase tracking-wider">Total Tracked</span>
            <strong className="text-2xl font-black mt-1">10 Channels</strong>
          </div>
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg">
            <TrendingUp className="w-8 h-8 text-[var(--destructive)] mb-3" />
            <span className="text-[var(--muted-foreground)] text-sm font-semibold uppercase tracking-wider">Total Network Subs</span>
            <strong className="text-2xl font-black mt-1">450K+</strong>
          </div>
        </div>

        {/* The Leaderboard List */}
        <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-4 border-b border-[var(--muted)] text-[var(--muted-foreground)] font-bold text-xs md:text-sm uppercase tracking-wider items-center px-6">
            <div className="w-8 text-center text-lg">#</div>
            <div>Channel</div>
            <div className="hidden md:flex justify-end min-w[100px] gap-2 items-center"><Users className="w-4 h-4"/> Subscribers</div>
            <div className="hidden md:flex justify-end min-w[100px] gap-2 items-center"><Eye className="w-4 h-4"/> Views</div>
          </div>
          
          <div className="divide-y divide-[var(--muted)]">
            {channels.map((channel, i) => (
              <div 
                key={channel.id} 
                className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto] gap-4 p-4 px-6 items-center hover:bg-[var(--muted)] transition-colors group"
              >
                {/* Rank */}
                <div className={`w-8 text-center font-black text-xl md:text-2xl ${
                  i === 0 ? 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]' :
                  i === 1 ? 'text-zinc-300 drop-shadow-[0_0_10px_rgba(212,212,216,0.3)]' :
                  i === 2 ? 'text-amber-600' : 'text-[var(--muted-foreground)]'
                }`}>
                  {i + 1}
                </div>
                
                {/* Channel Info */}
                <div className="flex flex-col">
                  <span className="font-bold text-base md:text-lg group-hover:text-[var(--accent)] transition-colors inline-block truncate flex items-center gap-2">
                    {channel.name}
                    {i === 0 && <Trophy className="w-4 h-4 text-yellow-400 hidden md:inline" />}
                  </span>
                  <Link 
                    href={channel.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[var(--muted-foreground)] text-xs md:text-sm flex items-center gap-1 hover:text-white transition-colors w-max"
                  >
                    Visit Channel <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                
                {/* Subscribers */}
                <div className="text-right font-black text-lg md:text-xl tabular-nums">
                  {channel.subscriberCount.toLocaleString()}
                  <div className="text-[var(--muted-foreground)] text-[10px] md:hidden">Subs</div>
                </div>

                {/* Views (Hidden on very small screens) */}
                <div className="hidden md:block text-right font-semibold text-[var(--muted-foreground)] tabular-nums">
                  {channel.totalViews.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}