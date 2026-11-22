import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import imgRally from '@/assets/debate-town-hall.jpg';
import imgPress from '@/assets/docket-press-conference.jpg';
import imgCapitol from '@/assets/capitol.jpg';
import imgDebate from '@/assets/debate-journalist.jpg';
import imgSigning from '@/assets/docket-bill-signing.jpg';
import imgTrail from '@/assets/docket-infrastructure.jpg';
import { useServerFn } from '@tanstack/react-start';
import { draftPost } from '@/lib/ai-post.functions';
import { Heart, MessageCircle, Repeat2, ChartNoAxesColumn, Share, Ellipsis, BadgeCheck, Feather, House, Bell, Mail, User, ArrowLeft, MapPin, Landmark, UserPlus, DollarSign, Zap, Radio, Tv, Newspaper, Sparkles, CheckCheck, Trash2, ChartPie, Users, Globe, TrendingUp } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import { portraitImages } from './portrait';
import coverImg from '@/assets/profile-cover.jpg';
import { rivalFeedItems, profileFor } from '@/lib/game/rival-feed';
import { publishStance, COVERAGE, coverageBlock, ownedCoverage, replyOptions, replyToThread, repliedThisTurn, draftSuggestions, type CoverageMode } from '@/lib/game/media';
import { mediaCompanies } from '@/lib/game/business';
import { toggleLike, toggleRepost, pendingAchievements, shareAchievement, dismissAchievement, type Reaction, type PostImage } from '@/lib/game/social-media';
import { reachAnalytics, followerDemographics, engagementBreakdown, type Share as AudienceShare } from '@/lib/game/social-analytics';
import {
  postTypes, socialOf, energyOf, postBlock, handleOf, isVerified, followingOf, postViews, threadsOf, ambientPosts,
  unreadNotifications, unreadMessages, markNotificationsRead, markThreadRead, monetizationEligible, markAllMessagesRead, deleteReadMessages, readMessageCount,
  POST_ENERGY_COST, MAX_POSTS_PER_QUARTER, MAX_POST_LENGTH, MONETIZE_FOLLOWERS, MONETIZE_ENGAGEMENT, VERIFIED_FOLLOWERS, CREATOR_RPM,
  type PostType, type SocialNotification,
} from '@/lib/game/social-media';

type Tab = 'home' | 'notifications' | 'messages' | 'profile';
type FeedItem = { id: string; date: string; author: string; handle: string; verified: boolean; avatar?: string | undefined; text: string; replies: number; reposts: number; likes: number; views: number; reactions?: Reaction[] | undefined; label?: string | undefined; image?: PostImage | undefined };
const IMAGES: Record<PostImage, [string, string]> = { rally: [imgRally, 'Town hall rally crowd'], press: [imgPress, 'Press conference'], capitol: [imgCapitol, 'The state capitol'], debate: [imgDebate, 'Debate stage'], signing: [imgSigning, 'Bill signing ceremony'], trail: [imgTrail, 'Campaign trail site visit'] };
type Acts = { liked: Set<string>; reposted: Set<string>; like: (id: string) => void; repost: (id: string) => void };
const ActsCtx = createContext<Acts | null>(null);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ''} ${d.slice(0, 4)}`;
const n = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M` : v >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K` : String(Math.round(v));
const initials = (name: string) => name.replace(/^(Sen\.|Prof\.|Gov\.)\s*/, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

function Avatar({ name, src, size = 40, className = '' }: { name: string; src?: string | undefined; size?: number; className?: string }) {
  return src ? <img className={`x-avatar ${className}`} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className={`x-avatar x-avatar-initials ${className}`} style={{ width: size, height: size }} aria-hidden>{initials(name)}</span>;
}
const Check = () => <BadgeCheck className="x-badge" aria-label="Verified account" />;

function RichText({ text }: { text: string }) {
  return <>{text.split(/([@#][\p{L}\p{N}_]+)/u).map((part, i) => /^[@#]/.test(part) ? <span key={i} className="x-link">{part}</span> : part)}</>;
}

function PostCard({ item, onProfile }: { item: FeedItem; onProfile?: (name: string) => void }) {
  const acts = useContext(ActsCtx), liked = !!acts?.liked.has(item.id), reposted = !!acts?.reposted.has(item.id);
  const img = item.image ? IMAGES[item.image] : null;
  return <article className="x-post">
    {onProfile ? <button type="button" className="x-author-btn" aria-label={`Open ${item.author}'s profile`} onClick={() => onProfile(item.author)}><Avatar name={item.author} src={item.avatar} /></button> : <Avatar name={item.author} src={item.avatar} />}
    <div className="min-w-0 flex-1">
      {item.label && <p className="x-context">{item.label}</p>}
      <p className="x-post-head">{onProfile ? <button type="button" className="x-author-btn x-author-name" onClick={() => onProfile(item.author)}><b>{item.author}</b></button> : <b>{item.author}</b>}{item.verified && <Check />}<span>{item.handle} · {when(item.date)}</span><Ellipsis className="x-more" aria-hidden /></p>
      <p className="x-post-body"><RichText text={item.text} /></p>
      {img && <img className="x-post-media" src={img[0]} alt={img[1]} loading="lazy" />}
      <p className="x-post-actions">
        <span><MessageCircle />{n(item.replies)}</span>
        <button type="button" className={`x-act x-act-repost${reposted ? ' is-on' : ''}`} aria-pressed={reposted} aria-label={reposted ? 'Undo repost' : 'Repost'} onClick={() => acts?.repost(item.id)}><Repeat2 />{n(item.reposts + (reposted ? 1 : 0))}</button>
        <button type="button" className={`x-act x-act-like${liked ? ' is-on' : ''}`} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'} onClick={() => acts?.like(item.id)}><Heart />{n(item.likes + (liked ? 1 : 0))}</button><span><ChartNoAxesColumn />{n(item.views)}</span><span aria-hidden><Share /></span>
      </p>
      {item.reactions?.length ? <div className="x-replies">{item.reactions.map((r, i) => <div key={i} className="x-reply" style={{ animationDelay: `${120 + i * 120}ms` }}>
        <Avatar name={r.author} size={26} />
        <div className="min-w-0"><p className="x-post-head"><b>{r.author}</b>{r.verified && <Check />}<span className={`x-role ${r.role === 'party' ? 'friend' : r.role === 'opposition' ? 'family' : ''}`}>{ROLE[r.role]}</span></p><p className="x-post-body">{r.text}</p></div>
      </div>)}</div> : null}
    </div>
  </article>;
}

const ROLE = { citizen: 'Voter', opposition: 'Opposition', party: 'Party colleague', press: 'Press' } as const;
const mentionItem = (m: SocialNotification): FeedItem => ({ id: m.id, date: m.date, author: m.author, handle: m.handle, verified: m.verified, text: m.text, replies: m.replies, reposts: m.reposts, likes: m.likes, views: m.views });

export function SocialFeed({ career, onUpdate, onNotice, initialTab = 'home' }: { career: Career; onUpdate: (c: Career) => void; onNotice: (m: string) => void; initialTab?: 'home' | 'messages' | 'notifications' }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    if (initialTab === 'notifications' && unreadNotifications(socialOf(career))) onUpdate(markNotificationsRead(career));
    // This entry action runs only when this view is opened, not on later career updates.
  }, []);
  const [viewing, setViewing] = useState<string | null>(null);
  const [feed, setFeed] = useState<'for-you' | 'following'>('for-you');
  const [nTab, setNTab] = useState<'all' | 'mentions'>('all');
  const [pTab, setPTab] = useState<'posts' | 'mentions'>('posts');
  const [thread, setThread] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const [type, setType] = useState<PostType>('policy');
  const [text, setText] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const draftFn = useServerFn(draftPost);
  const writeWithAI = async () => {
    if (aiTopic.trim().length < 2 || aiBusy) return;
    setAiBusy(true);
    try {
      const role = career.office ? `${career.office.title}, ${career.office.jurisdiction}` : career.campaign ? `Candidate for ${career.campaign.title}` : 'Rising political figure';
      const r = await draftFn({ data: { topic: aiTopic.trim().slice(0, 200), type, persona: { name: career.character.name, party: career.character.party, state: career.character.state, role: role.slice(0, 120), background: career.character.background, recent: socialOf(career).reactionFeed.slice(0, 3).map(x => `${career.character.name} ${x.about}`.slice(0, 160)) } } });
      if (r.ok) setText(r.text); else onNotice(r.error);
    } catch { onNotice('The writer is unavailable right now.'); } finally { setAiBusy(false); }
  };
  const [dashOpen, setDashOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const s = socialOf(career), me = career.character.name, handle = handleOf(career), verified = isVerified(career);
  const myAvatar = portraitImages[career.character.portrait] ?? portraitImages[0];
  const mine: FeedItem[] = s.posts.map(p => ({ id: p.id, date: p.date, author: me, handle, verified, avatar: myAvatar, text: p.text, replies: p.replies, reposts: p.reposts, likes: p.likes, views: postViews(p), reactions: p.reactions, label: p.controversial ? '🔥 Controversial · drawing pushback' : undefined }));
  const reacts: FeedItem[] = s.reactionFeed.map(r => ({ id: r.id, date: r.date, author: r.author, handle: r.handle, verified: r.verified, text: r.text, replies: r.replies, reposts: r.reposts, likes: r.likes, views: r.views, label: `${ROLE[r.role]} · reacting: ${me} ${r.about}` }));
  const mentions = s.notifications.filter(x => x.kind === 'mention').map(mentionItem);
  const ambient = ambientPosts(career);
  const rivals: FeedItem[] = rivalFeedItems(career).map(r => ({ ...r, avatar: portraitImages[r.portrait % portraitImages.length], label: `Candidate · ${career.campaign!.title} race` }));
  const byDate = (a: FeedItem, b: FeedItem) => b.date.localeCompare(a.date);
  const forYou = [...mine, ...rivals, ...reacts, ...mentions, ...ambient].sort(byDate);
  const following = [...mine, ...rivals, ...reacts.filter((_, i) => s.reactionFeed[i]!.role !== 'citizen'), ...ambient.filter(a => a.press)].sort(byDate);
  const unreadN = unreadNotifications(s), unreadM = unreadMessages(s), readCount = readMessageCount(s);
  const block = postBlock(career, type);
  const coverage = (m: CoverageMode) => { const r = ownedCoverage(career, m); onNotice(r.message); if (r.ok) onUpdate(r.career); };

  const open = (t: Tab) => {
    setTab(t); setThread(null); setViewing(null); setConfirmDelete(false);
    if (t === 'notifications' && unreadN) { setFresh(new Set(s.notifications.filter(x => !x.read).map(x => x.id))); onUpdate(markNotificationsRead(career)); }
  };
  const openProfile = (name: string) => { if (name === me) open('profile'); else { setTab('home'); setViewing(name); } };
  const openThread = (id: string) => { setThread(id); const next = markThreadRead(career, id); if (next !== career) onUpdate(next); };
  const acts: Acts = { liked: new Set(s.liked), reposted: new Set(s.reposted), like: id => onUpdate(toggleLike(career, id)), repost: id => onUpdate(toggleRepost(career, id)) };
  const achievements = pendingAchievements(career);
  const share = (key: string) => { const r = shareAchievement(career, key); onNotice(r.message); if (r.ok) onUpdate(r.career); };
  const post = () => { const r = publishStance(career, type, text); onNotice(r.message); if (r.ok) { onUpdate(r.career); setText(''); setComposing(false); setTab('home'); } };

  const tabs = (items: [string, string][], value: string, set: (v: never) => void) => <div className="x-tabs-top" role="tablist">
    {items.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={value === id} className="x-tab-top" onClick={() => set(id as never)}><span>{label}</span></button>)}
  </div>;
  const list = (items: FeedItem[], emptyText: ReactNode) => items.length ? items.map(i => <PostCard key={i.id} item={i} onProfile={openProfile} />) : <p className="x-empty">{emptyText}</p>;
  const viewed = viewing ? profileFor(career, viewing) : null;

  const views = s.posts.filter(p => p.date === career.date).reduce((t, p) => t + postViews(p), 0);
  const threads = threadsOf(s), active = thread ? threads.find(t => t.id === thread) : undefined;
  const bio = career.office ? `${career.office.title} · ${career.office.jurisdiction}` : career.campaign ? `Candidate for ${career.campaign.title} · ${career.campaign.jurisdiction}` : `${career.character.party} · ${career.character.background}`;

  return <ActsCtx.Provider value={acts}><div className="xapp">
    {tab === 'home' && <header className="x-top">
      {viewed ? <div className="x-top-row"><button type="button" className="x-icon-btn" aria-label="Back to feed" onClick={() => setViewing(null)}><ArrowLeft /></button><h2 className="x-title">{viewed.name}</h2><span /></div>
        : <>
          <div className="x-top-row"><button type="button" className="x-icon-btn" aria-label="Open your profile" onClick={() => open('profile')}><Avatar name={me} src={myAvatar} size={32} /></button><span className="x-logo s-logo" role="img" aria-label="S">S</span><span className="x-energy" title="Energy"><Zap />{energyOf(career)}%</span></div>
          {tabs([['for-you', 'For you'], ['following', 'Following']], feed, setFeed)}
        </>}
    </header>}
    {tab === 'notifications' && <header className="x-top"><div className="x-top-row"><span /><h2 className="x-title">Notifications</h2><span /></div>{tabs([['all', 'All'], ['mentions', 'Mentions']], nTab, setNTab)}</header>}
    {tab === 'messages' && <header className="x-top"><div className="x-top-row">
      {active ? <button type="button" className="x-icon-btn" aria-label="Back to messages" onClick={() => setThread(null)}><ArrowLeft /></button> : <span />}
      <h2 className="x-title">{active ? active.latest.from : 'Messages'}</h2><span /></div>
      {!active && <div className="x-inbox-tools">
        {confirmDelete ? <>
          <span className="x-dim">Delete {readCount} read message{readCount === 1 ? '' : 's'}?</span>
          <button type="button" className="x-chip x-chip-danger" onClick={() => { onUpdate(deleteReadMessages(career)); setConfirmDelete(false); onNotice(`Deleted ${readCount} read message${readCount === 1 ? '' : 's'}.`); }}>Delete</button>
          <button type="button" className="x-chip" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </> : <>
          <button type="button" className="x-chip" disabled={!unreadM} onClick={() => { onUpdate(markAllMessagesRead(career)); onNotice('All messages marked as read.'); }}><CheckCheck /> Mark All as Read</button>
          <button type="button" className="x-chip" disabled={!readCount} onClick={() => setConfirmDelete(true)}><Trash2 /> Delete All Read</button>
        </>}
      </div>}
    </header>}

    <div className="x-scroll" key={tab + feed + nTab + pTab + (thread ?? '')}>
      {tab === 'home' && !viewed && s.reactionFeed.some(r => r.about === 'general-election debate' && r.date === career.date) && <div className="debate-trend"><ChartNoAxesColumn size={16} /><div><small>Trending in politics</small><b>{s.reactionFeed.find(r => r.about === 'general-election debate' && r.date === career.date)?.text.split(' ')[0]}</b></div></div>}
      {tab === 'home' && !viewed && achievements.map(a => <div key={a.key} className="x-achieve" role="region" aria-label={`Milestone: ${a.title}`}>
        <p className="x-achieve-kicker"><Sparkles /> Milestone unlocked</p>
        <b>{a.title}</b>
        <p className="x-achieve-text">{a.text}</p>
        <div className="x-achieve-row"><button type="button" className="x-achieve-share" onClick={() => share(a.key)}>Share to S</button><button type="button" className="x-achieve-skip" onClick={() => onUpdate(dismissAchievement(career, a.key))}>Not now</button></div>
      </div>)}
      {tab === 'home' && !viewed && list(feed === 'for-you' ? forYou : following, 'Nothing here yet.')}
      {tab === 'home' && viewed && <>
        <div className="x-banner" />
        <div className="x-profile">
          <div className="x-profile-top"><Avatar name={viewed.name} src={viewed.portrait !== null ? portraitImages[viewed.portrait % portraitImages.length] : undefined} size={80} className="x-profile-avatar" /></div>
          <h2 className="x-profile-name">{viewed.name}{viewed.verified && <Check />}</h2>
          <p className="x-dim x-handle">{viewed.handle}</p>
          <p className="x-bio">{viewed.bio}</p>
          <p className="x-meta"><span><MapPin />{viewed.location}</span></p>
          <p className="x-counts"><span><b>{viewed.following.toLocaleString('en-US')}</b> Following</span><span><b>{viewed.followers.toLocaleString('en-US')}</b> Followers</span></p>
        </div>
        {list(viewed.posts, 'No posts to show.')}
      </>}

      {tab === 'notifications' && (nTab === 'mentions' ? list(mentions, 'When people tag you, you’ll see it here.') : s.notifications.length ? s.notifications.map(x => x.kind === 'mention'
        ? <div key={x.id} className={fresh.has(x.id) ? 'x-fresh' : undefined}><PostCard item={mentionItem(x)} onProfile={openProfile} /></div>
        : <div key={x.id} className={`x-note ${fresh.has(x.id) ? 'x-fresh' : ''}`}>
          <span className={`x-note-icon ${x.kind}`}>{x.kind === 'follow' ? <UserPlus /> : x.kind === 'verified' ? <BadgeCheck /> : <DollarSign />}</span>
          <div className="min-w-0 flex-1">{x.kind === 'follow' && <Avatar name={x.author} size={30} />}<p><b>{x.text}</b></p><small>{when(x.date)}</small></div>
        </div>) : <p className="x-empty">No notifications yet. Keep posting and advancing time.</p>)}

      {tab === 'messages' && !active && (threads.length ? threads.map(t => <button key={t.id} type="button" className="x-thread" onClick={() => openThread(t.id)}>
        <Avatar name={t.latest.from} src={t.latest.portrait || undefined} size={44} />
        <div className="min-w-0 flex-1 text-left">
          <p className="x-thread-head"><b>{t.latest.from}</b><span className="x-dim">· {when(t.latest.date)}</span></p>
          <span className={`x-role x-thread-role ${t.latest.kind}`}>{t.latest.role}</span>
          <p className={`x-thread-preview ${t.unread ? 'unread' : ''}`}>{t.last.fromMe ? 'You: ' : ''}{t.last.text}</p>
        </div>
        {t.unread > 0 && <span className="x-dot" aria-label={`${t.unread} unread`} />}
      </button>) : <p className="x-empty">No messages yet. Friends, family and political figures will reach out as your career grows.</p>)}
      {tab === 'messages' && active && <div className="x-chat">
        <div className="x-chat-who"><Avatar name={active.latest.from} src={active.latest.portrait || undefined} size={56} /><b>{active.latest.from}</b><span className={`x-role ${active.latest.kind}`}>{active.latest.role}</span></div>
        {active.messages.map(m => <div key={m.id} className={`x-bubble-wrap ${m.fromMe ? 'mine' : ''}`}><p className="x-bubble">{m.text}</p><small>{when(m.date)}</small></div>)}
        {repliedThisTurn(career, active.id) ? <p className="x-dim x-small x-center">You can reply again next turn.</p> : <div className="x-replies-pick">
          {replyOptions(active.latest.kind).map(o => <button key={o.id} type="button" className="x-point" onClick={() => { const r = replyToThread(career, active.id, o.id); onNotice(r.message); if (r.ok) onUpdate(r.career); }}><b>{o.label}</b><small>{o.hint}</small></button>)}
        </div>}
      </div>}

      {tab === 'profile' && <>
        <div className="x-banner-wrap">
          <img className="x-banner-img" src={coverImg} alt="" width={1504} height={512} loading="lazy" />
          <button type="button" className="x-icon-btn x-back-float" aria-label="Back to feed" onClick={() => open('home')}><ArrowLeft /></button>
        </div>
        <div className="x-profile">
          <div className="x-profile-top">
            <img className="x-profile-avatar" src={myAvatar} alt={me} width={80} height={80} />
            <button type="button" className="x-dash-btn" onClick={() => setDashOpen(true)}><ChartNoAxesColumn /> Professional Dashboard</button>
          </div>
          <h2 className="x-profile-name">{me}{verified && <Check />}</h2>
          <p className="x-dim x-handle">{handle}</p>
          <p className="x-bio">{bio}</p>
          <p className="x-meta"><span><MapPin />{career.character.state}</span><span><Landmark />{career.character.party}</span></p>
          <p className="x-counts"><span><b>{followingOf(career).toLocaleString('en-US')}</b> Following</span><span><b>{s.followers.toLocaleString('en-US')}</b> Followers</span></p>
        </div>
        {tabs([['posts', 'Posts'], ['mentions', 'Mentions']], pTab, setPTab)}
        {pTab === 'posts' ? list([...mine, ...forYou.filter(p => p.author !== me && s.reposted.includes(p.id)).map(p => ({ ...p, label: '🔁 You reposted' }))].sort(byDate), 'You haven’t posted yet.') : list(mentions, 'Nobody has tagged you yet.')}
      </>}
    </div>

    {tab === 'home' && !viewed && <button type="button" className="x-fab" aria-label="Compose post" onClick={() => setComposing(true)}><Feather /></button>}

    <nav className="x-nav" aria-label="S navigation">
      {([['home', House, 'Home', 0], ['notifications', Bell, 'Notifications', unreadN], ['messages', Mail, 'Messages', unreadM], ['profile', User, 'Profile', 0]] as const).map(([id, Icon, label, count]) =>
        <button key={id} type="button" aria-label={label} aria-current={tab === id ? 'page' : undefined} onClick={() => open(id)}><Icon />{count > 0 && <span className="x-count">{count > 9 ? '9+' : count}</span>}</button>)}
    </nav>

    {dashOpen && tab === 'profile' && <ProDashboard career={career} onClose={() => setDashOpen(false)} onCoverage={coverage} views={views} verified={verified} />}

    {composing && <div className="x-compose" role="dialog" aria-modal="true" aria-label="Compose post">
      <div className="x-compose-head"><button type="button" className="x-text-btn" onClick={() => setComposing(false)}>Cancel</button><button type="button" className="x-post-btn" disabled={!!block} onClick={post}>Post</button></div>
      <div className="x-compose-body">
        <Avatar name={me} src={myAvatar} />
        <textarea className="x-compose-text" autoFocus rows={5} maxLength={MAX_POST_LENGTH} placeholder={postTypes.find(p => p.id === type)?.template ?? 'What’s happening?'} value={text} onChange={e => setText(e.target.value)} aria-label="Post text" />
      </div>
      <div className="x-ai">
        <input className="x-ai-input" maxLength={200} placeholder="Topic or career event, e.g. new bus line opens" value={aiTopic} onChange={e => setAiTopic(e.target.value)} aria-label="Topic for AI draft" onKeyDown={e => { if (e.key === 'Enter') void writeWithAI(); }} />
        <button type="button" className="x-chip active" disabled={aiBusy || aiTopic.trim().length < 2} onClick={() => void writeWithAI()}><Sparkles className="inline size-3" /> {aiBusy ? 'Writing…' : 'Write with AI'}</button>
      </div>
      <p className="x-dim x-small mt-2">Ready-made drafts</p>
      <div className="x-drafts">{draftSuggestions(career).map((d, i) => <button key={i} type="button" className="x-draft" onClick={() => { setType(d.type); setText(d.text); }}>{d.text}</button>)}</div>
      <div className="x-chips">{postTypes.map(p => <button key={p.id} type="button" className={`x-chip ${type === p.id ? 'active' : ''}`} onClick={() => setType(p.id)}>{p.label}</button>)}</div>
      <div className="x-compose-foot"><span>−{POST_ENERGY_COST}% energy · {s.quarterPosts}/{MAX_POSTS_PER_QUARTER} this quarter</span><span>{MAX_POST_LENGTH - text.length}</span></div>
      {block && <p className="x-block">{block}</p>}
    </div>}
  </div></ActsCtx.Provider>;
}

function Progress({ label, value }: { label: string; value: number }) {
  return <div className="x-progress"><span>{label}</span><div><i style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} /></div></div>;
}

function Bars({ items, icon, title }: { items: AudienceShare[]; icon: ReactNode; title: string }) {
  return <section className="x-dash-card">
    <h4>{icon}{title}</h4>
    <div className="x-bars">{items.map((it, i) => <div key={it.label} className="x-bar-row">
      <span className="x-bar-label">{it.label}</span>
      <div className="x-bar"><i style={{ width: `${it.pct}%`, animationDelay: `${120 + i * 70}ms` }} /></div>
      <b>{it.pct}%</b>
    </div>)}</div>
  </section>;
}

function ProDashboard({ career, onClose, onCoverage, views, verified }: { career: Career; onClose: () => void; onCoverage: (m: CoverageMode) => void; views: number; verified: boolean }) {
  const s = socialOf(career), reach = reachAnalytics(career), demo = followerDemographics(career), eng = engagementBreakdown(career);
  const outlets = mediaCompanies(career);
  return <div className="x-compose x-pro" role="dialog" aria-modal="true" aria-labelledby="pro-dash-title">
    <div className="x-compose-head"><button type="button" className="x-icon-btn" aria-label="Back to profile" onClick={onClose}><ArrowLeft /></button><h2 id="pro-dash-title" className="x-title">Professional Dashboard</h2><span className="s-logo s-logo-sm" aria-hidden>S</span></div>
    <div className="x-pro-body">
      <section className="x-dash-card x-pro-hero">
        <h4><TrendingUp />Reach</h4>
        <div className="x-dash-grid">
          <div><span>Followers</span><b>{n(reach.followers)}</b></div>
          <div><span>Views this quarter</span><b>{n(views)}</b></div>
          <div><span>Average views per post</span><b>{n(reach.avgViews)}</b></div>
          <div><span>Reach rate</span><b>{reach.reachRate}%</b></div>
          <div><span>Followers won by posts</span><b>{n(reach.followersFromPosts)}</b></div>
          <div><span>Posts this quarter</span><b>{s.quarterPosts}/{MAX_POSTS_PER_QUARTER}</b></div>
        </div>
        {reach.recent.length ? <div className="x-spark" aria-label="Views on your latest posts">{reach.recent.map((r, i) => <div key={r.id} className="x-spark-col" title={`${n(r.views)} views`}>
          <i style={{ height: `${Math.max(6, Math.round((r.views / reach.peak) * 100))}%`, animationDelay: `${100 + i * 80}ms` }} /><small>{when(r.date).split(' ')[0]}</small>
        </div>)}</div> : <p className="x-dim x-small mt-2">Post to start building reach history.</p>}
      </section>

      <section className="x-dash-card">
        <h4><ChartPie />Engagement</h4>
        <div className="x-dash-grid">
          <div><span>Engagement rate</span><b>{eng.overall}%</b></div>
          <div><span>Likes · reposts · replies</span><b>{n(eng.totals.likes)} · {n(eng.totals.reposts)} · {n(eng.totals.replies)}</b></div>
        </div>
        <div className="x-bars mt-3">{eng.byType.map((t, i) => <div key={t.id} className="x-bar-row">
          <span className="x-bar-label">{t.label}<small> · {t.posts} post{t.posts === 1 ? '' : 's'}</small></span>
          <div className="x-bar"><i style={{ width: `${Math.min(100, t.rate * 5)}%`, animationDelay: `${120 + i * 70}ms` }} /></div>
          <b>{t.rate}%</b>
        </div>)}</div>
        {eng.best && <p className="x-dash-line"><Heart /> Best post · {eng.best.rate}% · “{eng.best.text.slice(0, 70)}{eng.best.text.length > 70 ? '…' : ''}”</p>}
      </section>

      <Bars title="Followers by voter bloc" icon={<Users />} items={demo.blocs} />
      <Bars title="Followers by age" icon={<User />} items={demo.ages} />
      <Bars title="Followers by location" icon={<Globe />} items={demo.locations} />

      <section className="x-dash-card">
        <h4><DollarSign />Creator status</h4>
        {s.monetizedSince ? <p className="x-dash-line"><DollarSign /> Monetized · ${s.earnings.toLocaleString('en-US')} earned · ${CREATOR_RPM} per 1,000 views</p>
          : <div className="x-progress-list">
            <p className="x-dash-line">{monetizationEligible(s) ? 'Eligible — monetization activates after this turn.' : 'Monetization unlocks at:'}</p>
            <Progress label={`${n(s.followers)} / ${n(MONETIZE_FOLLOWERS)} followers`} value={s.followers / MONETIZE_FOLLOWERS} />
            <Progress label={`${s.engagement}% / ${MONETIZE_ENGAGEMENT}% engagement`} value={s.engagement / MONETIZE_ENGAGEMENT} />
          </div>}
        <p className="x-dash-line"><Zap /> Energy {energyOf(career)}% · posting costs {POST_ENERGY_COST}%</p>
        {s.broadcastHistory.length > 0 && <p className="x-dash-line">{s.broadcastHistory[0]!.kind === 'tv' ? <Tv /> : s.broadcastHistory[0]!.kind === 'radio' ? <Radio /> : <Newspaper />} Last appearance: {s.broadcastHistory[0]!.outlet} — {s.broadcastHistory[0]!.good ? 'went well' : 'went badly'}</p>}
        {!verified && <p className="x-dash-line x-dim"><BadgeCheck /> Verification: reach {n(VERIFIED_FOLLOWERS)} followers, or serve as Mayor or higher.</p>}
      </section>

      {outlets.length > 0 && <section className="x-dash-card x-own">
        <p className="x-dash-line"><Newspaper /> Your media: {outlets.map(o => o.name).join(', ')}</p>
        {(Object.keys(COVERAGE) as CoverageMode[]).map(m => { const b = coverageBlock(career, m); return <button key={m} type="button" className="x-chip" disabled={!!b} title={b ?? undefined} onClick={() => onCoverage(m)}>{COVERAGE[m].label} · ${COVERAGE[m].cost.toLocaleString('en-US')}</button>; })}
        <p className="x-dim x-small">⚠️ Ethics risk: if reporters find out ({Math.round(COVERAGE.favorable.risk * 100)}–{Math.round(COVERAGE.editorial.risk * 100)}% chance) it becomes a conflict-of-interest scandal hurting reputation, approval and voter groups. Once per quarter.</p>
      </section>}
    </div>
  </div>;
}
