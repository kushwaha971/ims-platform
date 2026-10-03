"""B03 — `library_settings`, one row per tenant (LIB-01 §5).

The reminder-day elements (1–365) and their de-duplication are the service's;
the CHECK holds the count (at most six), which is what a second writer could
break.
"""

import apps.common.db.fields
import apps.library.models.settings
import django.contrib.postgres.fields
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0001_initial'),
        ('platform', '0013_closed_day'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LibrarySettings',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(default=apps.common.db.fields.uuid7, editable=False, primary_key=True, serialize=False)),
                ('version', models.IntegerField(default=1)),
                ('fine_skip_closed_days', models.BooleanField(default=True)),
                ('fine_rounding', models.CharField(default='rupee', max_length=8)),
                ('overdue_issue_rule', models.CharField(default='block', max_length=8)),
                ('lost_counts_toward_limit', models.BooleanField(default=True)),
                ('renew_from', models.CharField(default='today', max_length=10)),
                ('renew_overdue', models.CharField(default='charge_fine', max_length=12)),
                ('hold_pickup_days', models.SmallIntegerField(default=3)),
                ('lost_multiplier', models.DecimalField(decimal_places=2, default=Decimal('1.00'), max_digits=4)),
                ('lost_processing_fee', apps.common.db.fields.MoneyField(decimal_places=2, default=Decimal('0.00'), max_digits=14)),
                ('lost_found_paid', models.CharField(default='refund', max_length=8)),
                ('fallback_price', apps.common.db.fields.MoneyField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('damage_minor_amount', apps.common.db.fields.MoneyField(decimal_places=2, default=Decimal('20.00'), max_digits=14)),
                ('damage_major_percent', models.SmallIntegerField(default=50)),
                ('waiver_ceiling', apps.common.db.fields.MoneyField(blank=True, decimal_places=2, default=Decimal('100.00'), max_digits=14, null=True)),
                ('overdue_reminder_days', django.contrib.postgres.fields.ArrayField(base_field=models.SmallIntegerField(), default=apps.library.models.settings.default_reminder_days, size=None)),
                ('remind_day_before', models.BooleanField(default=False)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='+', to='platform.tenant')),
            ],
            options={
                'db_table': 'library_settings',
                'constraints': [models.UniqueConstraint(fields=('tenant',), name='uq_library_settings_tenant'), models.CheckConstraint(condition=models.Q(('fine_rounding__in', ['rupee', 'paise'])), name='ck_library_settings_fine_rounding'), models.CheckConstraint(condition=models.Q(('overdue_issue_rule__in', ['block', 'warn', 'off'])), name='ck_library_settings_overdue_issue_rule'), models.CheckConstraint(condition=models.Q(('renew_from__in', ['today', 'due_date'])), name='ck_library_settings_renew_from'), models.CheckConstraint(condition=models.Q(('renew_overdue__in', ['charge_fine', 'block'])), name='ck_library_settings_renew_overdue'), models.CheckConstraint(condition=models.Q(('lost_found_paid__in', ['refund', 'keep'])), name='ck_library_settings_lost_found_paid'), models.CheckConstraint(condition=models.Q(('hold_pickup_days__gte', 1), ('hold_pickup_days__lte', 30)), name='ck_library_settings_hold_pickup_days'), models.CheckConstraint(condition=models.Q(('lost_multiplier__gte', 0), ('lost_multiplier__lte', 10)), name='ck_library_settings_lost_multiplier'), models.CheckConstraint(condition=models.Q(('damage_major_percent__gte', 1), ('damage_major_percent__lte', 100)), name='ck_library_settings_damage_major_percent'), models.CheckConstraint(condition=models.Q(('damage_minor_amount__gte', 0), ('lost_processing_fee__gte', 0), models.Q(('fallback_price__isnull', True), ('fallback_price__gte', 0), _connector='OR'), models.Q(('waiver_ceiling__isnull', True), ('waiver_ceiling__gte', 0), _connector='OR')), name='ck_library_settings_money'), models.CheckConstraint(condition=models.Q(('overdue_reminder_days__len__lte', 6)), name='ck_library_settings_reminder_days')],
            },
        ),
    ]
