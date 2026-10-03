"""B05 — the catalogue (LIB-02 §5): categories, locations, titles, copies, copy events.

`search_text` is a stored generated column; G14 is settled by this migration
applying (Django compiles `Concat` to `||` over COALESCE, which is IMMUTABLE).
`accession_sort` is varchar(160) under C collation (G12, G13).
"""

import apps.common.db.fields
import django.contrib.postgres.indexes
import django.db.models.deletion
import django.db.models.functions.text
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0002_settings'),
        ('platform', '0013_closed_day'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LibraryCategory',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(default=apps.common.db.fields.uuid7, editable=False, primary_key=True, serialize=False)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('name', models.CharField(max_length=60)),
                ('sort_order', models.SmallIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='children', to='library.librarycategory')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='platform.tenant')),
            ],
            options={
                'db_table': 'library_category',
            },
        ),
        migrations.CreateModel(
            name='LibraryCopy',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(default=apps.common.db.fields.uuid7, editable=False, primary_key=True, serialize=False)),
                ('accession_number', models.CharField(max_length=24)),
                ('accession_sort', models.CharField(db_collation='C', max_length=160)),
                ('barcode', models.CharField(blank=True, max_length=40, null=True)),
                ('location_text', models.CharField(blank=True, default='', max_length=80)),
                ('status', models.CharField(default='available', max_length=16)),
                ('is_reference', models.BooleanField(default=False)),
                ('acquired_on', models.DateField(blank=True, null=True)),
                ('source', models.CharField(default='bought', max_length=12)),
                ('source_note', models.CharField(blank=True, default='', max_length=160)),
                ('price', apps.common.db.fields.MoneyField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('condition', models.CharField(default='good', max_length=8)),
                ('volume_label', models.CharField(blank=True, default='', max_length=24)),
                ('withdrawn_on', models.DateField(blank=True, null=True)),
                ('withdrawn_reason', models.CharField(blank=True, max_length=16, null=True)),
                ('withdrawn_note', models.CharField(blank=True, default='', max_length=160)),
                ('last_seen_on', models.DateField(blank=True, null=True)),
                ('issued_ever', models.BooleanField(default=False)),
                ('version', models.IntegerField(default=1)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='platform.tenant')),
            ],
            options={
                'db_table': 'library_copy',
            },
        ),
        migrations.CreateModel(
            name='LibraryCopyEvent',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(default=apps.common.db.fields.uuid7, editable=False, primary_key=True, serialize=False)),
                ('from_status', models.CharField(blank=True, max_length=16, null=True)),
                ('to_status', models.CharField(max_length=16)),
                ('reason_code', models.CharField(max_length=24)),
                ('note', models.CharField(blank=True, default='', max_length=160)),
                ('source_type', models.CharField(blank=True, max_length=48, null=True)),
                ('source_id', models.UUIDField(blank=True, null=True)),
                ('on_date', models.DateField()),
                ('copy', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='events', to='library.librarycopy')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='platform.tenant')),
            ],
            options={
                'db_table': 'library_copy_event',
            },
        ),
        migrations.CreateModel(
            name='LibraryLocation',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(default=apps.common.db.fields.uuid7, editable=False, primary_key=True, serialize=False)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('code', models.CharField(max_length=24)),
                ('name', models.CharField(blank=True, default='', max_length=80)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.SmallIntegerField(default=0)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='platform.tenant')),
            ],
            options={
                'db_table': 'library_location',
            },
        ),
        migrations.AddField(
            model_name='librarycopy',
            name='location',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='library.librarylocation'),
        ),
        migrations.CreateModel(
            name='LibraryTitle',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(default=apps.common.db.fields.uuid7, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('subtitle', models.CharField(blank=True, default='', max_length=300)),
                ('authors', models.CharField(blank=True, default='', max_length=300)),
                ('isbn13', models.CharField(blank=True, max_length=13, null=True)),
                ('publisher', models.CharField(blank=True, default='', max_length=160)),
                ('edition', models.CharField(blank=True, default='', max_length=40)),
                ('year', models.SmallIntegerField(blank=True, null=True)),
                ('language', models.CharField(blank=True, default='', max_length=40)),
                ('material_type', models.CharField(default='book', max_length=16)),
                ('call_number', models.CharField(blank=True, default='', max_length=40)),
                ('keywords', models.CharField(blank=True, default='', max_length=300)),
                ('notes', models.TextField(blank=True, default='')),
                ('copies_total', models.IntegerField(default=0)),
                ('copies_available', models.IntegerField(default=0)),
                ('status', models.CharField(default='active', max_length=10)),
                ('search_text', models.GeneratedField(db_persist=True, expression=django.db.models.functions.text.Lower(django.db.models.functions.text.Concat('title', models.Value(' '), 'subtitle', models.Value(' '), 'authors', models.Value(' '), 'publisher', models.Value(' '), 'keywords', output_field=models.TextField())), output_field=models.TextField())),
                ('version', models.IntegerField(default=1)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='library.librarycategory')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='platform.tenant')),
            ],
            options={
                'db_table': 'library_title',
            },
        ),
        migrations.AddField(
            model_name='librarycopy',
            name='title',
            field=models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='copies', to='library.librarytitle'),
        ),
        migrations.AddConstraint(
            model_name='librarycategory',
            constraint=models.UniqueConstraint(models.F('tenant'), django.db.models.functions.text.Lower('name'), condition=models.Q(('deleted_at__isnull', True)), name='uq_library_category_name'),
        ),
        migrations.AddConstraint(
            model_name='librarycategory',
            constraint=models.CheckConstraint(condition=models.Q(('parent', models.F('id')), _negated=True), name='ck_library_category_not_own_parent'),
        ),
        migrations.AddIndex(
            model_name='librarycopyevent',
            index=models.Index(fields=['copy', 'created_at'], name='ix_library_copy_event_copy'),
        ),
        migrations.AddConstraint(
            model_name='librarycopyevent',
            constraint=models.CheckConstraint(condition=models.Q(('reason_code__in', ['created', 'issued', 'returned', 'set_aside', 'withdrawn', 'repair', 'back_to_shelf', 'lost', 'found', 'missing', 'cancelled_issue', 'imported', 'edited_number'])), name='ck_library_copy_event_reason'),
        ),
        migrations.AddConstraint(
            model_name='librarycopyevent',
            constraint=models.CheckConstraint(condition=models.Q(('to_status__in', ['available', 'on_loan', 'on_hold_shelf', 'in_repair', 'lost', 'missing', 'withdrawn'])), name='ck_library_copy_event_to_status'),
        ),
        migrations.AddConstraint(
            model_name='librarylocation',
            constraint=models.UniqueConstraint(models.F('tenant'), django.db.models.functions.text.Upper('code'), condition=models.Q(('deleted_at__isnull', True)), name='uq_library_location_code'),
        ),
        migrations.AddIndex(
            model_name='librarytitle',
            index=django.contrib.postgres.indexes.GinIndex(django.contrib.postgres.indexes.OpClass('search_text', name='gin_trgm_ops'), name='ix_library_title_search'),
        ),
        migrations.AddIndex(
            model_name='librarytitle',
            index=models.Index(condition=models.Q(('isbn13__isnull', False)), fields=['tenant', 'isbn13'], name='ix_library_title_isbn'),
        ),
        migrations.AddIndex(
            model_name='librarytitle',
            index=models.Index(models.F('tenant'), models.F('status'), django.db.models.functions.text.Lower('title'), name='ix_library_title_list'),
        ),
        migrations.AddIndex(
            model_name='librarytitle',
            index=models.Index(fields=['tenant', 'category'], name='ix_library_title_category'),
        ),
        migrations.AddConstraint(
            model_name='librarytitle',
            constraint=models.CheckConstraint(condition=models.Q(('material_type__in', ['book', 'reference', 'magazine', 'textbook', 'audio_visual', 'other'])), name='ck_library_title_material_type'),
        ),
        migrations.AddConstraint(
            model_name='librarytitle',
            constraint=models.CheckConstraint(condition=models.Q(('status__in', ['active', 'archived'])), name='ck_library_title_status'),
        ),
        migrations.AddConstraint(
            model_name='librarytitle',
            constraint=models.CheckConstraint(condition=models.Q(('year__isnull', True), models.Q(('year__gte', 1500), ('year__lte', 2100)), _connector='OR'), name='ck_library_title_year'),
        ),
        migrations.AddConstraint(
            model_name='librarytitle',
            constraint=models.CheckConstraint(condition=models.Q(('copies_available__gte', 0), ('copies_total__gte', 0), ('copies_available__lte', models.F('copies_total'))), name='ck_library_title_caches'),
        ),
        migrations.AddIndex(
            model_name='librarycopy',
            index=models.Index(fields=['tenant', 'accession_sort'], name='ix_library_copy_sort'),
        ),
        migrations.AddIndex(
            model_name='librarycopy',
            index=models.Index(fields=['tenant', 'status'], name='ix_library_copy_status'),
        ),
        migrations.AddIndex(
            model_name='librarycopy',
            index=models.Index(fields=['tenant', 'title'], name='ix_library_copy_title'),
        ),
        migrations.AddIndex(
            model_name='librarycopy',
            index=models.Index(fields=['tenant', 'location'], name='ix_library_copy_location'),
        ),
        migrations.AddIndex(
            model_name='librarycopy',
            index=models.Index(fields=['tenant', 'last_seen_on'], name='ix_library_copy_last_seen'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.UniqueConstraint(models.F('tenant'), django.db.models.functions.text.Upper('accession_number'), name='uq_library_copy_accession'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.UniqueConstraint(models.F('tenant'), django.db.models.functions.text.Upper('barcode'), condition=models.Q(('barcode__isnull', False)), name='uq_library_copy_barcode'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('status', 'withdrawn'), ('withdrawn_on__isnull', False)), models.Q(models.Q(('status', 'withdrawn'), _negated=True), ('withdrawn_on__isnull', True)), _connector='OR'), name='ck_library_copy_withdrawn'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.CheckConstraint(condition=models.Q(('status__in', ['available', 'on_loan', 'on_hold_shelf', 'in_repair', 'lost', 'missing', 'withdrawn'])), name='ck_library_copy_status'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.CheckConstraint(condition=models.Q(('source__in', ['bought', 'gifted', 'transferred', 'other'])), name='ck_library_copy_source'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.CheckConstraint(condition=models.Q(('condition__in', ['good', 'fair', 'poor'])), name='ck_library_copy_condition'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.CheckConstraint(condition=models.Q(('withdrawn_reason__isnull', True), ('withdrawn_reason__in', ['worn_out', 'lost', 'missing', 'transferred', 'damaged', 'other']), _connector='OR'), name='ck_library_copy_withdrawn_reason'),
        ),
        migrations.AddConstraint(
            model_name='librarycopy',
            constraint=models.CheckConstraint(condition=models.Q(('price__isnull', True), ('price__gte', 0), _connector='OR'), name='ck_library_copy_price'),
        ),
    ]
