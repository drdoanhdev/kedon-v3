import { ExternalLink } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import PageHeader from '../components/PageHeader';
import {
  PRODUCT_FEATURE_GROUPS,
  countCatalogFeatures,
  getPlanLabel,
  resolveFeatureMinPlan,
} from '../lib/productFeaturesCatalog';

export default function TinhNangPage() {
  const { groups, items } = countCatalogFeatures();

  return (
    <ProtectedRoute>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <PageHeader
          title="Tính năng"
          subtitle={`Optigo hỗ trợ phòng khám / cửa hàng kính — ${items} tính năng trong ${groups} nhóm`}
        />

        <nav className="mb-8 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Mục lục</p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_FEATURE_GROUPS.map((group) => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {group.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-8">
          {PRODUCT_FEATURE_GROUPS.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-24">
              <div className="mb-3">
                <h2 className="text-lg font-bold text-blue-800 border-b border-gray-100 pb-1">
                  {group.title}
                </h2>
                <p className="mt-1.5 text-sm text-gray-500">{group.description}</p>
              </div>

              <div className="space-y-3">
                {group.items.map((item) => {
                  const minPlan = resolveFeatureMinPlan(item);
                  return (
                    <article
                      key={item.id}
                      className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-gray-800">{item.name}</h3>
                            {minPlan && (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                Từ gói {getPlanLabel(minPlan)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{item.summary}</p>
                        </div>
                        {item.href && !item.href.includes('[') && (
                          <Link
                            href={item.href}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            Mở trang
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>

                      {item.details.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {item.details.map((detail) => (
                            <li key={detail} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                              <span className="leading-relaxed">{detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {item.note && (
                        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          {item.note}
                        </p>
                      )}

                      {item.href?.includes('[') && (
                        <p className="mt-2 text-xs text-gray-400">
                          Route: <code className="bg-gray-50 px-1 rounded">{item.href}</code>
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 mb-4 text-center text-xs text-gray-400">
          Nội dung lấy từ catalog tập trung{' '}
          <code className="rounded bg-gray-100 px-1">src/lib/productFeaturesCatalog.ts</code>. Khi thêm
          tính năng mới, cập nhật file đó để trang này tự phản ánh.
        </p>
      </div>
    </ProtectedRoute>
  );
}
